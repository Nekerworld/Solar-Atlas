from datetime import datetime, timezone
from bs4 import BeautifulSoup

WIKI = 'https://ko.wikipedia.org/w/api.php'
WD = 'https://www.wikidata.org/w/api.php'


def now():
    return datetime.now(timezone.utc).isoformat()


class Wikipedia:
    def __init__(self, http, language='ko'):
        if language not in ('ko', 'en'):
            raise ValueError('Unsupported Wikipedia language')
        self.http = http
        self.language = language
        self.base = f'https://{language}.wikipedia.org'
        self.api = self.base + '/w/api.php'

    def entity(self, qid):
        data = self.http.request(WD, {'action':'wbgetentities', 'ids':qid, 'props':'labels|descriptions|aliases|claims|sitelinks', 'languages':'ko|en', 'format':'json'})
        entity = data['entities'][qid]
        if 'missing' in entity:
            raise ValueError('Missing Wikidata entity: ' + qid)
        return entity

    def document(self, title=None, pageid=None):
        identity = {'pageid':pageid} if pageid is not None else {'page':title}
        result = self.http.request(self.api, {'action':'parse', **identity, 'prop':'text|revid|properties', 'redirects':1, 'format':'json', 'formatversion':2})
        page = result['parse']
        # formatversion=2 returns a property-name mapping. An empty string
        # still means that the disambiguation property is present.
        properties = page.get('properties', {})
        if isinstance(properties, dict):
            is_disambiguation = 'disambiguation' in properties
        elif isinstance(properties, list):
            is_disambiguation = any(isinstance(p, dict) and p.get('name') == 'disambiguation' for p in properties)
        else:
            raise ValueError('Unexpected Wikipedia page properties format')
        if is_disambiguation:
            raise ValueError('Disambiguation page is not a source document')
        # .mw-disambig on an anchor describes its destination, not this page.
        soup = BeautifulSoup(page['text'], 'html.parser')
        tables = [table.get_text(' ', strip=True) for table in soup.select('table.infobox, table.wikitable')]
        for tag in soup.select('script, style, .navbox, .vertical-navbox, .metadata, .reflist, .mw-editsection, sup.reference, figure, table'):
            tag.decompose()
        blocks, section = [], '개요'
        for tag in soup.find_all(['h2','h3','h4','h5','h6','p','li']):
            if tag.find_parent(['p','li']):
                continue
            text = tag.get_text(' ', strip=True)
            if not text:
                continue
            if tag.name.startswith('h'):
                section = text
            else:
                blocks.append({'section':section, 'kind':tag.name, 'text':text})
        blocks.extend({'section':'표', 'kind':'table', 'text':table} for table in tables if table)
        paragraphs = []
        for block in blocks:
            for start in range(0, len(block['text']), 3500):
                paragraphs.append({'id':f'p{len(paragraphs)+1}', **block, 'text':block['text'][start:start+3500]})
        if not paragraphs:
            raise ValueError('Document has no readable text')
        page_id = page['pageid']
        return {'document_id':f'{self.language}wiki:{page_id}', 'page_id':page_id, 'title':page['title'],
                'source':'wikipedia', 'source_url':f'{self.base}/?curid={page_id}',
                'revision_id':page['revid'], 'revision_url':f"{self.base}/w/index.php?oldid={page['revid']}",
                'collected_at':now(), 'language':self.language, 'license_url':self.base + ('/wiki/위키백과:저작권' if self.language == 'ko' else '/wiki/Wikipedia:Copyrights'),
                'raw_html':page['text'], 'paragraphs':paragraphs,
                'content':'\n\n'.join(p['text'] for p in paragraphs)}

    def search(self, query, limit=5):
        result = self.http.request(self.api, {'action':'query', 'list':'search', 'srsearch':query, 'srlimit':limit, 'srnamespace':0, 'format':'json'})
        return [{'page_id':p['pageid'], 'title':p['title'], 'summary':BeautifulSoup(p['snippet'], 'html.parser').get_text(' ', strip=True)} for p in result['query']['search']]
