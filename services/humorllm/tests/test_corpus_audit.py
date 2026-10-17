import unittest
from humorllm.corpus_audit import near_duplicate_pairs


class CorpusAuditTests(unittest.TestCase):
    def test_overlap_flags_preserve_distinct_rows_for_manual_review(self):
        rows=[{'id':'b','text':'The cat claims it worked all day but the laptop stayed closed.'},
              {'id':'a','text':'The cat claims it worked all day, but the laptop stayed closed!'},
              {'id':'c','text':'I bought a new umbrella because the forecast promised rain.'}]
        before=[dict(row) for row in rows]
        self.assertEqual(near_duplicate_pairs(rows),[{
            'left':'a','right':'b','token_jaccard':1.0,'word_counts':[12,12],
            'requires_manual_adjudication':True}])
        self.assertEqual(rows,before)

    def test_short_overlap_and_embedded_quote_do_not_imply_duplicate(self):
        rows=[{'id':'a','text':'The laptop stayed closed.'},
              {'id':'b','text':'The laptop stayed closed all day while the cat claimed overtime.'},
              {'id':'c','text':'The laptop stayed closed all day while the cat claimed overtime. '
                               'A long unrelated story describes a baker baking bread and leaving early.'}]
        self.assertEqual(near_duplicate_pairs(rows),[])
        with self.assertRaises(ValueError):near_duplicate_pairs([rows[0],rows[0]])
