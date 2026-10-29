"""Task-cluster bootstrap of blinded human preference. No model judge scores."""
import collections
import json
import pathlib
import random
import statistics
import sys

run = pathlib.Path(sys.argv[1])
ratings = [r for name in sys.argv[2:] for r in json.loads(pathlib.Path(name).read_text())]
if not ratings:
    raise SystemExit("Supply human ratings.json files. No preference claim can be calculated without ratings.")
keys = {(r['id'], r['label']): r['arm'] for r in json.loads((run/'blind-key.json').read_text())}
results = json.loads((run/'results.json').read_text())
seen = set()
for rating in ratings:
    identity = (rating['task_id'], rating['reviewer'])
    if identity in seen:
        raise ValueError(f'Duplicate task/reviewer: {identity}')
    seen.add(identity)
for mode in ('pic', 'thought'):
    tasks = {r['task_id'] for r in results if r['mode'] == mode}
    scores = collections.defaultdict(list)
    outcomes = collections.Counter()
    for row in ratings:
        if row['task_id'] not in tasks:
            continue
        choice = row['humor']
        if choice not in ('A', 'B', 'Tie', 'Neither'):
            raise ValueError('Missing or invalid humor rating')
        arm = keys.get((row['task_id'], choice), choice)
        outcomes[arm] += 1
        scores[row['task_id']].append(1 if arm == 'cowriter' else 0 if arm == 'baseline' else .5)
    means = [statistics.mean(v) for v in scores.values()]
    if not means:
        print(mode, 'No human ratings'); continue
    rng = random.Random(20261029)
    samples = sorted(statistics.mean(rng.choices(means, k=len(means))) for _ in range(10000))
    print(json.dumps({'mode': mode, 'planned_tasks': len(tasks), 'rated_tasks': len(means), 'missing_tasks': sorted(tasks-scores.keys()), 'raw_votes':dict(outcomes), 'tie_adjusted_cowriter_preference':statistics.mean(means), 'task_cluster_bootstrap_95_interval':[samples[249],samples[9749]], 'failed_arms':sum(bool(r.get('error')) for r in results if r['mode']==mode), 'caution':'Exploratory interval; tasks, not captions or repeated ratings, are independent units. Neither counts as .5 but is also reported separately. No automatic release decision.'}))
