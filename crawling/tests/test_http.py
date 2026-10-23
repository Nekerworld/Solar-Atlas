import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from email.utils import format_datetime
from pathlib import Path
from unittest.mock import Mock, patch
from solar.clients import HTTP, retry_delay, wiki_user_agent
from solar.config import ROOT


def response(status=200, data=None, headers=None):
    result = Mock()
    result.status_code = status
    result.ok = status < 400
    result.headers = headers or {}
    result.json.return_value = data if data is not None else {'query':{}}
    return result


class HTTPTests(unittest.TestCase):
    def test_contact_validation(self):
        self.assertIn('(test@example.org)', wiki_user_agent(' test@example.org '))
        self.assertIn('(https://example.org/contact)', wiki_user_agent('https://example.org/contact'))
        for invalid in ('한글@example.org', 'test@example.org\r\nInjected:1', 'not-an-email'):
            with self.subTest(invalid=invalid), self.assertRaises(ValueError):
                wiki_user_agent(invalid)

    def test_retry_after_not_capped(self):
        self.assertEqual(retry_delay('300',2),300)
        self.assertEqual(retry_delay('1.5',2),1.5)
        self.assertEqual(retry_delay('invalid',2),2)
        date = format_datetime(datetime.now(timezone.utc) + timedelta(seconds=300))
        self.assertGreater(retry_delay(date,2),298)

    def test_headers_maxlag_retry_and_cache(self):
        with tempfile.TemporaryDirectory(dir=ROOT) as directory, patch.dict('os.environ',{'WIKI_CONTACT':'test@example.org'}), patch('solar.clients.time.sleep') as sleep:
            http=HTTP(directory)
            http.session.request=Mock(side_effect=[response(429,headers={'Retry-After':'300'}),response(data={'query':{'success':True}})])
            url='https://ko.wikipedia.org/w/api.php'
            result=http.request(url,{'action':'query'})
            self.assertIn('(test@example.org)',http.session.headers['User-Agent'])
            self.assertEqual(http.session.request.call_args.kwargs['params']['maxlag'],5)
            self.assertTrue(result['query']['success'])
            self.assertIn(unittest.mock.call(300),sleep.call_args_list)
            self.assertEqual(http.request(url,{'action':'query'}),result)
            self.assertEqual(http.session.request.call_count,2)

    def test_maxlag_200_retries_and_does_not_cache_error(self):
        with tempfile.TemporaryDirectory(dir=ROOT) as directory, patch.dict('os.environ',{'WIKI_CONTACT':'test@example.org'}), patch('solar.clients.time.sleep') as sleep:
            http=HTTP(directory)
            http.session.request=Mock(side_effect=[response(data={'error':{'code':'maxlag'}},headers={'Retry-After':'7'}),response(data={'query':{'ok':1}})])
            self.assertEqual(http.request('https://www.wikidata.org/w/api.php',{'action':'query'}),{'query':{'ok':1}})
            self.assertIn(unittest.mock.call(7),sleep.call_args_list)
            self.assertEqual(len(list(Path(directory).glob('*.json'))),1)

    def test_unauthorized_not_retried(self):
        with tempfile.TemporaryDirectory(dir=ROOT) as directory, patch.dict('os.environ',{'WIKI_CONTACT':'test@example.org'}), patch('solar.clients.time.sleep'):
            http=HTTP(directory)
            http.session.request=Mock(return_value=response(401))
            with self.assertRaises(RuntimeError):
                http.request('https://ko.wikipedia.org/w/api.php')
            self.assertEqual(http.session.request.call_count,1)

    def test_no_contact_slows_down(self):
        with patch.dict('os.environ',{'WIKI_CONTACT':''}), self.assertWarns(UserWarning):
            http=HTTP(ROOT/'unused-test-cache')
        self.assertGreaterEqual(http.wiki_interval,6)


if __name__ == '__main__':
    unittest.main()
