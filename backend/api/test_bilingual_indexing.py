"""No APIs: translated chunks use Korean but keep English paragraph provenance."""
import unittest
from rag.chunking import chunk_document
from rag.answering import _source
import json

class BilingualIndexTests(unittest.TestCase):
    def test_translation_and_excluded_english_sections(self):
        doc = {'translation': {'status': 'verified'}, 'paragraphs': [
            {'id': 'p1', 'section': 'Mass', 'text': 'Its mass is 12 kg.', 'translated_text': '질량은 12 kg이다.', 'translated_section': '질량'},
            {'id': 'p2', 'section': 'References', 'text': 'Ref', 'translated_text': '참고 문헌', 'translated_section': '참고 문헌'}]}
        chunks = chunk_document(doc, 1000, 150)
        self.assertEqual(len(chunks), 1)
        self.assertEqual(chunks[0]['text'], '질량은 12 kg이다.')
        self.assertEqual(chunks[0]['paragraph_ids'], ['p1'])
        self.assertEqual(doc['paragraphs'][0]['text'], 'Its mass is 12 kg.')

    def test_sources_expose_translation_as_translation(self):
        originals = [{'paragraph_id': 'p1', 'text': 'Its mass is 12 kg.'}]
        source = _source({'item_id': 'Q1', 'title': 'English article', 'source_url': 'https://en.wikipedia.org/?curid=1',
                          'document_id': 'enwiki:1', 'is_translation': True, 'original_passages': json.dumps(originals)}, 'Q1')
        self.assertTrue(source['is_translation'])
        self.assertEqual(source['original_passages'], originals)
        self.assertIn('en.wikipedia.org', source['url'])
