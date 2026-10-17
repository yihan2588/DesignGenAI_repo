"""Serverless deliveries are authenticated, specific and idempotent."""
import os
from pathlib import Path
import unittest
from unittest.mock import patch
from humorllm.hosted import HostedWorker

RUN='00000000-0000-0000-0000-000000000001'
class Client:
    def __init__(self,job):self.job=job;self.calls=[]
    def rpc(self,name,**payload):self.calls.append((name,payload));return self.job

class HostedTests(unittest.TestCase):
    def worker(self,client):
        w=HostedWorker(Path('/missing-index'),Path('/missing-encoder'),client=client)
        w.local_retriever=lambda:object()
        return w
    def test_worker_auth_fails_closed_and_uses_the_existing_capability(self):
        with patch.dict(os.environ,{'HUMOR_WORKER_KEY':'x'*48}):
            w=self.worker(Client(None))
            self.assertFalse(w.authorized(None));self.assertFalse(w.authorized('wrong'))
            self.assertTrue(w.authorized('x'*48))
        with patch.dict(os.environ,{'HUMOR_WORKER_KEY':''}):self.assertFalse(w.authorized(''))
    def test_duplicate_delivery_returns_terminal_without_provider_or_publication(self):
        c=Client({'terminal':True,'status':'ready'})
        result,status=self.worker(c).run(RUN)
        self.assertEqual((result,status),({'status':'ready','reused':True},200))
        self.assertEqual(len(c.calls),1)
        self.assertEqual(c.calls[0][0],'humor_worker_claim_run')
        self.assertEqual(c.calls[0][1]['p_run'],RUN)
    def test_leased_job_is_retried_instead_of_acknowledged_as_success(self):
        c=Client(None)
        self.assertEqual(self.worker(c).run(RUN),({'status':'busy'},409))
        self.assertEqual(len(c.calls),1)
    def test_invalid_job_does_not_load_models_or_contact_database(self):
        c=Client(None)
        with self.assertRaises(ValueError):self.worker(c).run('not-a-run')
        self.assertFalse(c.calls)

if __name__=='__main__':unittest.main()
