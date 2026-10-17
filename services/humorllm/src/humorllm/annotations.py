"""Reproducible sampling and strict validation of worker-authored annotations.

This module never infers an annotation, judges funniness, or calls a model.
"""
from __future__ import annotations

import argparse
import collections
import csv
import hashlib
import itertools
import json
from pathlib import Path
import unicodedata

MECHANISMS = set('literal_interpretation wordplay role_reversal incongruity exaggeration misdirection irony absurdity other none'.split())
TRANSFERS = set('situational wordplay_only low uncertain'.split())
RISKS = set('protected_target sexual violence death self_harm profanity cruelty substance_use politics_religion stereotype unclear malformed instruction_text'.split())
DECISIONS = {'include', 'review', 'exclude'}
LIMITS = {'situation': 180, 'expectation': 160, 'twist': 180, 'reason': 180}
FIELDS = {'id', 'text_sha256', *LIMITS, 'mechanism', 'entities', 'transferability', 'risk_flags', 'decision', 'confidence'}


def read_jsonl(path: str | Path) -> list[dict]:
    return [json.loads(line) for line in Path(path).read_text().splitlines() if line.strip()]


def write_jsonl(path: str | Path, rows: list[dict]) -> None:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + '.tmp')
    temporary.write_text(''.join(json.dumps(row, ensure_ascii=False) + '\n' for row in rows))
    temporary.replace(path)


def source_records(path: str | Path) -> list[dict]:
    rows, seen = [], set()
    with Path(path).open() as file:
        for number, item in enumerate(csv.DictReader(file), 1):
            text = ' '.join(unicodedata.normalize('NFKC', item['full_joke']).split())
            digest = hashlib.sha256(text.encode()).hexdigest()
            if not text or digest in seen:
                continue
            seen.add(digest)
            rows.append({'id': f'cc-en-{number:05d}', 'source_row': number,
                         'text_sha256': digest, 'text': text, 'setup': item['set-up'],
                         'punchline': item['punchline'], 'source_label': item['humour_label'],
                         'length_band': 'short' if len(text) <= 80 else 'medium'})
    return rows


def sample_records(rows: list[dict], per_stratum: int) -> list[dict]:
    buckets = collections.defaultdict(list)
    for row in rows:
        buckets[(row['source_label'], row['length_band'])].append(row)
    selected = []
    for _, bucket in sorted(buckets.items()):
        if len(bucket) < per_stratum:
            raise ValueError('Not enough records in a requested stratum.')
        bucket.sort(key=lambda r: hashlib.sha256(('humorllm-annotation-v1:' + r['id'] + r['text_sha256']).encode()).hexdigest())
        selected.extend(bucket[:per_stratum])
    return sorted(selected, key=lambda r: r['id'])


def validate_annotation(row: dict, source: dict) -> None:
    if set(row) != FIELDS:
        raise ValueError(f"{source['id']}: field mismatch: missing={FIELDS - set(row)}, extra={set(row) - FIELDS}")
    for key in ('id', 'text_sha256'):
        if row[key] != source[key]:
            raise ValueError(f"{source['id']}: changed {key}")
    for key, maximum in LIMITS.items():
        value = row[key]
        if not isinstance(value, str) or not value.strip() or len(value) > maximum:
            raise ValueError(f"{source['id']}: invalid {key}")
    for key, allowed in [('mechanism', MECHANISMS), ('transferability', TRANSFERS),
                         ('decision', DECISIONS), ('confidence', {'high', 'medium', 'low'})]:
        if row[key] not in allowed:
            raise ValueError(f"{source['id']}: invalid {key}: {row[key]}")
    entities, risks = row['entities'], row['risk_flags']
    if (not isinstance(entities, list) or len(entities) > 6 or
        any(not isinstance(x, str) or not x.strip() or len(x) > 80 for x in entities) or
        len(entities) != len(set(entities))):
        raise ValueError(f"{source['id']}: invalid entities")
    if not isinstance(risks, list) or any(r not in RISKS for r in risks) or len(risks) != len(set(risks)):
        raise ValueError(f"{source['id']}: invalid risk flags")
    if row['decision'] == 'include' and (risks or row['mechanism'] == 'none' or row['transferability'] == 'uncertain'):
        raise ValueError(f"{source['id']}: uncertain/risky record cannot be included")


def validate_file(input_path: str | Path, output_path: str | Path) -> list[dict]:
    inputs, outputs = read_jsonl(input_path), read_jsonl(output_path)
    source = {r['id']: r for r in inputs}
    seen = set()
    for row in outputs:
        if row['id'] not in source or row['id'] in seen:
            raise ValueError(f"Unexpected or repeated ID: {row['id']}")
        validate_annotation(row, source[row['id']])
        seen.add(row['id'])
    if seen != source.keys():
        raise ValueError(f'Missing annotations: {sorted(source.keys() - seen)}')
    return outputs


def agreement_report(by_id: dict[str, list[dict]]) -> dict:
    shared = {key: rows for key, rows in by_id.items() if len(rows) > 1}
    report = {'shared_records': len(shared), 'decision_unanimous': 0,
              'mechanism_unanimous': 0, 'transferability_unanimous': 0,
              'risk_flags_unanimous': 0, 'decision_pairwise_agreement': None,
              'disagreement_ids': []}
    pairs, equal = 0, 0
    for key, rows in shared.items():
        differs = False
        for field in ['decision', 'mechanism', 'transferability', 'risk_flags']:
            values = [tuple(sorted(r[field])) if isinstance(r[field], list) else r[field] for r in rows]
            if len(set(values)) == 1:
                report[field + '_unanimous'] += 1
            else:
                differs = True
        for a, b in itertools.combinations(rows, 2):
            pairs += 1
            equal += a['decision'] == b['decision']
        if differs:
            report['disagreement_ids'].append(key)
    if pairs:
        report['decision_pairwise_agreement'] = equal / pairs
    return report


def collect(root: Path, stage: str) -> tuple[dict, dict]:
    by_id = collections.defaultdict(list)
    workers = {}
    for input_path in sorted((root / stage).glob('worker-*-input.jsonl')):
        output = input_path.with_name(input_path.name.replace('-input', '-output'))
        rows = validate_file(input_path, output)
        worker = input_path.stem.replace('-input', '')
        workers[worker] = dict(collections.Counter(r['decision'] for r in rows))
        for row in rows:
            by_id[row['id']].append({**row, '_worker': worker})
    return by_id, workers


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='command', required=True)
    prepare = sub.add_parser('prepare')
    prepare.add_argument('source', type=Path)
    prepare.add_argument('--root', required=True, type=Path)
    validate = sub.add_parser('validate')
    validate.add_argument('input', type=Path)
    validate.add_argument('output', type=Path)
    collect_parser = sub.add_parser('collect')
    collect_parser.add_argument('--root', required=True, type=Path)
    collect_parser.add_argument('--stage', choices=['pilot', 'scale'], required=True)
    args = parser.parse_args()
    if args.command == 'prepare':
        source = source_records(args.source)
        pilot, final = sample_records(source, 50), sample_records(source, 250)
        write_jsonl(args.root / 'pilot-200.jsonl', pilot)
        write_jsonl(args.root / 'selected-1000.jsonl', final)
        pilot_ids = {r['id'] for r in pilot}
        write_jsonl(args.root / 'scale-800.jsonl', [r for r in final if r['id'] not in pilot_ids])
        print(json.dumps({'normalized_unique': len(source), 'pilot': len(pilot), 'selected': len(final)}))
    elif args.command == 'validate':
        rows = validate_file(args.input, args.output)
        print(json.dumps({'records': len(rows), 'decisions': dict(collections.Counter(r['decision'] for r in rows))}))
    else:
        by_id, workers = collect(args.root, args.stage)
        report = {'unique_records': len(by_id), 'annotations': sum(map(len, by_id.values())),
                  'workers': workers, 'agreement': agreement_report(by_id)}
        (args.root / args.stage / 'raw-agreement.json').write_text(json.dumps(report, indent=2) + '\n')
        write_jsonl(args.root / args.stage / 'submitted-annotations.jsonl',
                    [{'id': key, 'annotations': rows} for key, rows in sorted(by_id.items())])
        print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
