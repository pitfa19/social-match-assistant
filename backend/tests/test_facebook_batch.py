import importlib.util
from pathlib import Path

import pytest

spec = importlib.util.spec_from_file_location('facebook_batch', Path(__file__).parents[1] / 'scripts/collect_facebook_batch.py')
batch = importlib.util.module_from_spec(spec)
spec.loader.exec_module(batch)
GROUP = 'https://www.facebook.com/groups/123'


def row(**changes):
    return {'postId':'456','postUrl':GROUP+'/posts/456','postedAt':'2026-10-01T12:00:00Z',
            'text':'Prodajem stol. Kontakt test@example.com', 'source':{'name':'Test group','url':GROUP},
            'author':{'name':'Do not store'},'topComments':[{'text':'Do not store'}],**changes}


def test_normalized_live_provenance_and_privacy():
    result=batch.normalize(row(),GROUP,'job','secret')
    assert result['record_kind']=='live_imported'
    assert result['neighbourhood_id'] is None
    assert result['city'] is None
    assert result['provenance']['source_group_url']==GROUP
    assert result['provenance']['latest_order_verified'] is False
    assert 'test@example.com' not in result['body']
    assert 'author' not in result and 'topComments' not in result


@pytest.mark.parametrize('changes',[
    {'postUrl':'https://evil.example/post'},
    {'postUrl':'https://www.facebook.com/groups/other/posts/456','source':{'url':'https://www.facebook.com/groups/other'}},
    {'postedAt':'2099-01-01T00:00:00Z'},
    {'postedAt':'invalid'},
    {'postId':''},
    {'text':''},
])
def test_invalid_or_textless_rows_rejected(changes):
    with pytest.raises(ValueError):
        batch.normalize(row(**changes),GROUP,'job',None)


def test_observed_redirect_inventory_is_bounded():
    assert len(batch.RESOLVED)==16
    assert len(set(batch.RESOLVED.values()))==16
