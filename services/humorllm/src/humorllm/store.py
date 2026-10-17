"""Transactional cost reservations, leased local runs, and durable checkpoints."""
from __future__ import annotations

import json
from pathlib import Path
import sqlite3
import threading
import time
import uuid


class Database:
    def __init__(self, path):
        if str(path) != ':memory:':Path(path).parent.mkdir(parents=True, exist_ok=True)
        self.db = sqlite3.connect(str(path), timeout=30, isolation_level=None, check_same_thread=False)
        self.db.execute('pragma journal_mode=WAL')
        self.db.execute('pragma busy_timeout=30000')
        self.lock = threading.RLock()

    def __enter__(self):return self
    def __exit__(self,*_):self.db.close()


class Ledger(Database):
    def __init__(self,path,limit: float):
        super().__init__(path)
        if not 0 < limit <= 25:raise ValueError('Qualification cap must be positive and at most the authorized $25.')
        self.db.executescript('''create table if not exists budget(singleton integer primary key check(singleton=1), ceiling real not null);
          create table if not exists reservations(id text primary key,stage text not null,reserved real not null,
          actual real,created real not null);''')
        with self.lock:
            self.db.execute('begin immediate')
            try:
                self.db.execute('insert or ignore into budget values(1,?)',(limit,))
                self.db.execute('update budget set ceiling=min(ceiling,?) where singleton=1',(limit,))
                self.db.execute('commit')
            except BaseException:self.db.execute('rollback');raise

    def total(self):
        with self.lock:return self.db.execute('select coalesce(sum(coalesce(actual,reserved)),0) from reservations').fetchone()[0]

    def reserve(self,amount: float,stage: str):
        if not 0 < amount <= 1:raise ValueError('Invalid per-request reservation.')
        with self.lock:
            self.db.execute('begin immediate')
            try:
                ceiling = self.db.execute('select ceiling from budget where singleton=1').fetchone()[0]
                if self.total()+amount > ceiling+1e-9:raise ValueError('Qualification budget exhausted.')
                token = str(uuid.uuid4())
                self.db.execute('insert into reservations values(?,?,?,null,?)',(token,stage,amount,time.time()))
                self.db.execute('commit');return token
            except BaseException:self.db.execute('rollback');raise

    def settle(self,token: str,actual: float | None):
        if actual is None:return  # Unknown usage stays fully reserved, even after a crash/error.
        if actual < 0:raise ValueError('Invalid actual cost.')
        with self.lock:
            self.db.execute('begin immediate')
            try:
                row = self.db.execute('select reserved,actual from reservations where id=?',(token,)).fetchone()
                if row is None or row[1] is not None:raise ValueError('Missing or already settled reservation.')
                self.db.execute('update reservations set actual=? where id=?',(actual,token));self.db.execute('commit')
            except BaseException:self.db.execute('rollback');raise
        if actual > row[0]+1e-9:raise ValueError('Actual provider cost exceeded reservation; scheduling stopped.')


class RunStore(Database):
    def __init__(self,path):
        super().__init__(path);self.tokens = {}
        self.db.executescript('''create table if not exists runs(id text primary key,fingerprint text not null,status text not null,
          token text,lease_until real,attempts integer not null default 0,result text);
          create table if not exists checkpoints(run_id text,stage text,value text not null,primary key(run_id,stage));
          create table if not exists steps(sequence integer primary key autoincrement,run_id text,stage text,value text);''')

    def begin(self,run: str,fingerprint: str):
        with self.lock:
            self.db.execute('begin immediate')
            try:
                row = self.db.execute('select fingerprint,status,lease_until from runs where id=?',(run,)).fetchone()
                if row and row[0] != fingerprint:raise ValueError('Run fingerprint changed; use a new run ID.')
                if row and row[1] in {'ready','degraded'}:self.db.execute('commit');return None
                if row and row[1] == 'running' and (row[2] or 0)>time.time():raise ValueError('Run already leased.')
                token = str(uuid.uuid4());self.tokens[run] = token
                self.db.execute('insert into runs(id,fingerprint,status,token,lease_until) values(?,?,?,?,?) '
                                'on conflict(id) do update set status=excluded.status,token=excluded.token,lease_until=excluded.lease_until',
                                (run,fingerprint,'running',token,time.time()+180))
                self.db.execute('commit');return token
            except BaseException:self.db.execute('rollback');raise

    def import_resume(self,run,fingerprint,checkpoints,attempts):
        """Restore only checkpoints with the identical input/code/corpus fingerprint."""
        if not checkpoints:return
        if checkpoints.get('input_manifest',{}).get('fingerprint')!=fingerprint:
            raise ValueError('Remote checkpoint fingerprint changed; refuse replay.')
        if not 0<=attempts<=12:raise ValueError('Invalid persisted model-attempt count.')
        with self.lock:
            self.db.execute('begin immediate')
            try:
                row=self.db.execute('select fingerprint,status,lease_until from runs where id=?',(run,)).fetchone()
                if row and row[0]!=fingerprint:raise ValueError('Run fingerprint changed.')
                if row and row[1]=='running' and (row[2] or 0)>time.time():raise ValueError('Local run still leased.')
                self.db.execute("insert into runs(id,fingerprint,status,attempts) values(?,?,'failed',?) on conflict(id) do update set attempts=max(attempts,excluded.attempts)",(run,fingerprint,attempts))
                for stage,value in checkpoints.items():
                    if stage not in {'input_manifest','runtime_receipt'}:
                        self.db.execute('insert into checkpoints values(?,?,?) on conflict(run_id,stage) do nothing',(run,stage,json.dumps(value)))
                if not self.db.execute('select 1 from steps where run_id=?',(run,)).fetchone():
                    for step in checkpoints.get('runtime_receipt',{}).get('steps',[]):
                        self.db.execute('insert into steps(run_id,stage,value) values(?,?,?)',(run,step['stage'],json.dumps(step)))
                self.db.execute('commit')
            except BaseException:self.db.execute('rollback');raise

    def _check(self,run):
        row = self.db.execute('select token,lease_until,status from runs where id=?',(run,)).fetchone()
        if not row or row[0] != self.tokens.get(run) or (row[1] or 0)<time.time() or row[2]!='running':
            raise ValueError('Run lease expired or belongs to another worker.')

    def heartbeat(self,run):
        with self.lock:
            now=time.time()
            changed=self.db.execute('update runs set lease_until=? where id=? and token=? and status=? and lease_until>=?',
                                    (now+180,run,self.tokens.get(run),'running',now)).rowcount
            if changed!=1:raise ValueError('Run lease expired or belongs to another worker.')

    def attempt(self,run,maximum=12):
        with self.lock:
            self.db.execute('begin immediate')
            try:
                self._check(run)
                number = self.db.execute('select attempts from runs where id=?',(run,)).fetchone()[0]
                if number >= maximum:raise ValueError('Run reached its persistent model-attempt limit.')
                self.db.execute('update runs set attempts=attempts+1 where id=?',(run,));self.db.execute('commit')
                return number+1
            except BaseException:self.db.execute('rollback');raise

    def save(self,run,stage,value):
        with self.lock:
            self.db.execute('begin immediate')
            try:
                self._check(run)
                self.db.execute('insert into checkpoints values(?,?,?) on conflict(run_id,stage) do nothing',
                                (run,stage,json.dumps(value)))
                self.db.execute('commit')
            except BaseException:self.db.execute('rollback');raise

    def load(self,run,stage):
        with self.lock:
            row = self.db.execute('select value from checkpoints where run_id=? and stage=?',(run,stage)).fetchone()
            return json.loads(row[0]) if row else None

    def record(self,run,stage,value):
        with self.lock:
            changed=self.db.execute('insert into steps(run_id,stage,value) select ?,?,? from runs '
                'where id=? and token=? and status=? and lease_until>=?',
                (run,stage,json.dumps(value),run,self.tokens.get(run),'running',time.time())).rowcount
            if changed!=1:raise ValueError('Run lease expired or belongs to another worker.')

    def history(self,run):
        with self.lock:
            return [json.loads(r[0]) for r in self.db.execute('select value from steps where run_id=? order by sequence',(run,))]

    def result(self,run):
        row = self.db.execute('select result from runs where id=?',(run,)).fetchone()
        return json.loads(row[0]) if row and row[0] else None

    def finish(self,run,status,result):
        if status not in {'ready','failed','degraded'}:raise ValueError('Invalid terminal run status.')
        with self.lock:
            changed=self.db.execute('update runs set status=?,result=?,lease_until=null,token=null where id=? '
                'and token=? and status=? and lease_until>=?',
                (status,json.dumps(result),run,self.tokens.get(run),'running',time.time())).rowcount
            if changed!=1:raise ValueError('Run lease expired or belongs to another worker.')
