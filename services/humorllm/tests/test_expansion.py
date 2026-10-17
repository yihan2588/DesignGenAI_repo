import hashlib
import json
from pathlib import Path
import tempfile
import unittest
from humorllm.expand_corpus import validate_rows,expand_include,commit,commit_review,export_corpus
from humorllm.retrieval import prepare_examples


def fixture():
    source={'id':'cc-en-00001','text':'Attendance is his whole job.','setup':'A worker attends.',
            'text_sha256':hashlib.sha256(b'Attendance is his whole job.').hexdigest()}
    include=[source['id'],'I','A worker attends without contributing.','Attendance accompanies productive work.',
        'Attendance substitutes for all productive work.','irony',['worker','office'],
        'A necessary preliminary action replaces the actual work.',
        'A cat lies on a laptop keyboard without typing.','Attendance confirmed. Productivity remains optional.',
        ['A subject is visibly present at an unused workstation.']]
    return source,include


class ExpansionTests(unittest.TestCase):
    def test_legacy_duplicate_override_excludes_retrieval_without_editing_archive(self):
        source,row=fixture()
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);(root/'sources.jsonl').write_text('');(root/'calibration.json').write_text('[]')
            legacy={**source,**expand_include(row,source),'review':{'coordinator_reviewed':True}}
            previous=root/'previous.jsonl';previous.write_text(json.dumps(legacy)+'\n');before=previous.read_bytes()
            (root/'coordinator-quarantine.jsonl').write_text(json.dumps({'id':source['id'],'reason':'Duplicate of another archived source.'})+'\n')
            result=export_corpus(root,previous,root/'corpus.jsonl',target=0)
            self.assertEqual(result['legacy_records'],0)
            self.assertEqual(result['legacy_quarantined_ids'],[source['id']])
            self.assertEqual(previous.read_bytes(),before)
            self.assertEqual((root/'corpus.jsonl').read_text(),'')

    def test_source_identity_order_and_wordplay_cannot_be_padded_into_target(self):
        source,row=fixture();sources={source['id']:source}
        validate_rows([row],[source['id']],sources)
        with self.assertRaises(ValueError):validate_rows([row],['cc-en-00002'],sources)
        changed=list(row);changed[5]='wordplay'
        with self.assertRaises(ValueError):expand_include(changed,source)
        changed=list(row);changed[-1]=[]
        with self.assertRaises(ValueError):expand_include(changed,source)

    def test_commits_are_resumable_and_require_another_review_worker(self):
        source,row=fixture()
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);(root/'worker-1').mkdir()
            (root/'sources.jsonl').write_text(json.dumps(source)+'\n')
            (root/'calibration.json').write_text('[]')
            (root/'worker-1/assignment.json').write_text(json.dumps([source['id']]))
            p=root/'batch.json';p.write_text(json.dumps([row]));commit(root,'worker-1',p)
            with self.assertRaises(ValueError):commit(root,'worker-1',p)
            p.write_text(json.dumps([[source['id'],'A','The attendance/work reversal survives.',
                'A student sits beside an unopened textbook.','Studying has an excellent attendance record.']]))
            with self.assertRaises(ValueError):commit_review(root,'worker-1','reviewer-1',p)
            result=commit_review(root,'worker-1','reviewer-2',p)
            self.assertEqual(result['verdicts'],{'A':1})

    def test_export_requires_target_verified_hashes_and_two_semantic_passes(self):
        source,row=fixture()
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);(root/'worker-1').mkdir()
            (root/'sources.jsonl').write_text(json.dumps(source)+'\n');(root/'calibration.json').write_text('[]')
            (root/'worker-1/assignment.json').write_text(json.dumps([source['id']]))
            for i in [2,3]:
                (root/f'worker-{i}').mkdir();(root/f'worker-{i}/assignment.json').write_text('[]')
            previous=root/'previous.jsonl';previous.write_text('')
            p=root/'batch.json';p.write_text(json.dumps([row]));commit(root,'worker-1',p)
            with self.assertRaises(ValueError):export_corpus(root,previous,root/'corpus.jsonl',target=1)
            p.write_text(json.dumps([[source['id'],'A','The substitution preserves attendance without work.',
                'A student sits beside an unopened textbook.','My studying has perfect attendance.']]))
            commit_review(root,'worker-1','reviewer-2',p)
            result=export_corpus(root,previous,root/'corpus.jsonl',target=1)
            self.assertEqual(result['new_reviewed_situational'],1)
            rows=prepare_examples(root/'corpus.jsonl')
            self.assertEqual(len(rows),1)
            self.assertFalse(rows[0]['review']['coordinator_reviewed'])
            self.assertTrue(rows[0]['review']['independent_model_reviewed'])
            self.assertFalse(rows[0]['production_eligible'])
            with self.assertRaises(ValueError):export_corpus(root,previous,root/'other.jsonl',target=2)


if __name__=='__main__':unittest.main()
