import hashlib
from pathlib import Path
import tempfile
import unittest
from humorllm.annotations import validate_annotation, validate_file, write_jsonl, agreement_report, sample_records

class AnnotationTests(unittest.TestCase):
    def setUp(self):
        self.source={'id':'cc-en-00001','text_sha256':hashlib.sha256(b'fixture').hexdigest()}
        self.row={**self.source,'situation':'A worker attends but contributes nothing.','expectation':'Attendance implies participation.','twist':'Physical presence is treated as the whole job.','mechanism':'irony','entities':['worker','workplace'],'transferability':'situational','risk_flags':[],'decision':'include','reason':'Coherent relation that could transfer to a visible work scene.','confidence':'high'}
    def test_valid_semantic_record_preserves_identity(self):
        validate_annotation(self.row,self.source)
    def test_wrong_hash_duplicate_flags_and_unclear_inclusion_fail(self):
        for changed in [{'text_sha256':'0'*64},{'risk_flags':['unclear'],'decision':'include'},{'mechanism':'none','decision':'include'},{'transferability':'uncertain','decision':'include'},{'risk_flags':['unclear','unclear'],'decision':'review'},{'situation':' '}]:
            with self.subTest(changed=changed), self.assertRaises(ValueError):validate_annotation({**self.row,**changed},self.source)
    def test_agreement_is_measured_before_adjudication(self):
        result=agreement_report({'a':[{**self.row,'decision':'include'},{**self.row,'decision':'exclude'},{**self.row,'decision':'include'}]})
        self.assertEqual(result['shared_records'],1)
        self.assertEqual(result['decision_unanimous'],0)
        self.assertAlmostEqual(result['decision_pairwise_agreement'],1/3)
    def test_file_requires_exactly_one_annotation_per_assigned_id(self):
        with tempfile.TemporaryDirectory() as folder:
            source=Path(folder)/'input.jsonl'
            target=Path(folder)/'output.jsonl'
            write_jsonl(source,[self.source])
            for rows in [[],[self.row,self.row],[{**self.row,'id':'foreign-id'}]]:
                write_jsonl(target,rows)
                with self.subTest(rows=rows), self.assertRaises(ValueError):
                    validate_file(source,target)
            write_jsonl(target,[self.row])
            self.assertEqual(validate_file(source,target),[self.row])
    def test_sampling_is_stable_and_label_is_only_a_stratum(self):
        rows=[{'id':str(i),'source_label':str(i%2),'length_band':'short' if i%4<2 else 'medium','text_sha256':str(i)} for i in range(40)]
        first=sample_records(rows,2)
        self.assertEqual(first,sample_records(list(reversed(rows)),2))
        self.assertEqual(len(first),8)

if __name__=='__main__':unittest.main()
