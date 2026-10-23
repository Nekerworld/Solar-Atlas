"""Offline regressions; no GMS calls. Run manually with unittest discovery."""
import copy
import tempfile
import unittest
from pathlib import Path
from solar.bilingual import validate_translation, translate_document, assess
from solar.config import checklist_for, select_targets

class FakeLLM:
    def __init__(self, replies):
        self.replies = iter(replies)
        self.calls = 0
    def json(self, *args):
        self.calls += 1
        return next(self.replies)

class BilingualTests(unittest.TestCase):
    def test_full_registry_and_separate_expansion(self):
        self.assertEqual(len(select_targets()), 100)
        self.assertEqual(len(select_targets('expansion')), 30)
        self.assertEqual(len(select_targets('base')), 13)

    def test_numbers_and_paragraph_identity_must_survive(self):
        group = [{'id': 'p1', 'section': 'Size', 'text': 'Its diameter is 1,234 km in 2023.'}]
        good = {'paragraphs': [{'id': 'p1', 'section': '크기', 'text': '2023년 지름은 1,234 km이다.'}]}
        self.assertEqual(validate_translation(group, good)[0]['text'], group[0]['text'])
        for text in ['2023년 지름은 1,235 km이다.', '지름은 1,234 km이다.']:
            with self.assertRaises(ValueError):
                validate_translation(group, {'paragraphs': [{'id': 'p1', 'section': '크기', 'text': text}]})
        with self.assertRaises(ValueError):
            validate_translation(group, {'paragraphs': [good['paragraphs'][0], good['paragraphs'][0]]})

    def test_sentence_punctuation_is_not_part_of_a_number(self):
        group = [{'id': 'p1', 'section': 'Launch', 'text': 'It launched in 1973.'}]
        result = validate_translation(group, {'paragraphs': [{'id': 'p1', 'section': '발사', 'text': '1973년에 발사되었다.'}]})
        self.assertEqual(result[0]['translated_text'], '1973년에 발사되었다.')

    def test_translation_preserves_original_and_reuses_verified_cache(self):
        doc = {'document_id': 'enwiki:1', 'revision_id': 2, 'title': 'Object', 'language': 'en',
               'raw_html': '<p>The mass is 12 kg.</p>', 'content': 'The mass is 12 kg.',
               'paragraphs': [{'id': 'p1', 'section': 'Mass', 'text': 'The mass is 12 kg.'}]}
        original = copy.deepcopy(doc)
        llm = FakeLLM([{'paragraphs': [{'id': 'p1', 'section': '질량', 'text': '질량은 12 kg이다.'}]},
                       {'paragraphs': [{'id': 'p1', 'faithful': True, 'issues': []}]}])
        with tempfile.TemporaryDirectory() as directory:
            out = Path(directory)
            result = translate_document(llm, doc, out)
            again = translate_document(FakeLLM([]), result, out)
            self.assertEqual(again['translation']['signature'], result['translation']['signature'])
            self.assertEqual(result['paragraphs'][0]['text'], original['paragraphs'][0]['text'])
            self.assertEqual(result['content'], original['content'])
            self.assertEqual(doc, original)
            self.assertEqual(llm.calls, 2)

    def test_failed_semantic_review_never_marks_translation_complete(self):
        doc = {'document_id': 'enwiki:1', 'revision_id': 2, 'paragraphs': [{'id': 'p1', 'section': 'Mass', 'text': 'Mass 12 kg.'}]}
        llm = FakeLLM([{'paragraphs': [{'id': 'p1', 'section': '질량', 'text': '질량은 12 kg이다.'}]},
                       {'paragraphs': [{'id': 'p1', 'faithful': False, 'issues': ['Meaning changed']}]}])
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaises(ValueError):
                translate_document(llm, doc, Path(directory))
            self.assertFalse(list(Path(directory).rglob('*.json')))

    def test_unsupported_coverage_is_research_candidate(self):
        item = {'id': 'Q1', 'name_ko': '테스트', 'type': 'asteroid'}
        fields = checklist_for(item['type'])
        llm = FakeLLM([{'fields': [{'field': f, 'status': 'covered', 'evidence': [
            {'document_id': 'kowiki:1', 'paragraph_id': 'p1', 'quote': 'invented'}]} for f in fields]}])
        audit = assess(llm, item, [{'document_id': 'kowiki:1', 'paragraphs': [{'id': 'p1', 'section': '개요', 'text': '실제 근거'}]}])
        self.assertEqual(audit['missing_fields'], fields)

if __name__ == '__main__':
    unittest.main()
