"""Exercise HTTP boundaries without external services or model calls."""
import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch,Mock
from fastapi.testclient import TestClient

class HostedHTTPTests(unittest.TestCase):
    def setUp(self):
        self.worker=Mock()
        self.worker.authorized.side_effect=lambda key:key=='test-key'
        path=Path(__file__).parents[1]/'hosted/index.py'
        spec=importlib.util.spec_from_file_location('hosted_http_test',path)
        module=importlib.util.module_from_spec(spec)
        with patch('humorllm.hosted.HostedWorker',return_value=self.worker):spec.loader.exec_module(module)
        self.client=TestClient(module.app)
        self.headers={'x-humor-worker-key':'test-key'}
    def test_unauthorized_request_cannot_load_encoder_or_start_run(self):
        for path in ['/health','/work']:
            response=self.client.post(path,json={'run_id':'anything'})
            self.assertEqual(response.status_code,401)
        self.worker.run.assert_not_called();self.worker.local_retriever.assert_not_called()
    def test_malformed_and_oversize_bodies_cannot_start_run(self):
        for content in [b'[]',b'{}',b'not-json',b'x'*1024]:
            response=self.client.post('/work',headers=self.headers,content=content)
            self.assertEqual(response.status_code,400)
        self.worker.run.assert_not_called()
    def test_terminal_delivery_and_transient_failure_have_distinct_http_status(self):
        self.worker.run.return_value=({'status':'ready','reused':True},200)
        response=self.client.post('/work',headers=self.headers,json={'run_id':'run'})
        self.assertEqual(response.json(),{'status':'ready','reused':True})
        self.assertEqual(response.headers['cache-control'],'no-store')
        self.worker.run.side_effect=RuntimeError('private provider detail')
        response=self.client.post('/work',headers=self.headers,json={'run_id':'run'})
        self.assertEqual(response.status_code,503)
        self.assertNotIn('private provider detail',response.text)

if __name__=='__main__':unittest.main()
