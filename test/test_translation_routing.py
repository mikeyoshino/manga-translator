import pytest
from unittest.mock import patch, MagicMock

from manga_translator.config import TranslatorChain, Translator, Config


# --- TranslatorChain parsing tests ---

# We need to patch the imports inside TranslatorChain.__init__ which imports
# from manga_translator.translators. We patch at the module level.

def _make_mock_translators():
    return {
        Translator.sugoi: MagicMock(),
        Translator.chatgpt: MagicMock(),
        Translator.offline: MagicMock(),
        Translator.m2m100: MagicMock(),
        Translator.none: MagicMock(),
    }

def _make_mock_languages():
    return {
        'CHS': 'Chinese (Simplified)',
        'CHT': 'Chinese (Traditional)',
        'ENG': 'English',
        'JPN': 'Japanese',
        'KOR': 'Korean',
        'THA': 'Thai',
    }

_MOCK_TRANSLATORS = _make_mock_translators()
_MOCK_LANGUAGES = _make_mock_languages()


@patch('manga_translator.translators.TRANSLATORS', _MOCK_TRANSLATORS)
@patch('manga_translator.translators.VALID_LANGUAGES', _MOCK_LANGUAGES)
def test_chain_sugoi_eng_parses():
    """Single translator chain parses correctly."""
    chain = TranslatorChain('sugoi:ENG')
    assert len(chain.chain) == 1
    assert chain.langs == ('ENG',)


@patch('manga_translator.translators.TRANSLATORS', _MOCK_TRANSLATORS)
@patch('manga_translator.translators.VALID_LANGUAGES', _MOCK_LANGUAGES)
def test_chain_two_hop_jpn_to_tha():
    """Two-hop chain 'sugoi:ENG;chatgpt:THA' parses both steps."""
    chain = TranslatorChain('sugoi:ENG;chatgpt:THA')
    assert len(chain.chain) == 2
    assert chain.langs == ('ENG', 'THA')


@patch('manga_translator.translators.TRANSLATORS', _MOCK_TRANSLATORS)
@patch('manga_translator.translators.VALID_LANGUAGES', _MOCK_LANGUAGES)
def test_chain_has_offline():
    """has_offline() detects offline translators in the chain."""
    chain = TranslatorChain('sugoi:ENG')
    with patch('manga_translator.translators.OFFLINE_TRANSLATORS', {Translator.sugoi: MagicMock()}):
        assert chain.has_offline() is True


@patch('manga_translator.translators.TRANSLATORS', _MOCK_TRANSLATORS)
@patch('manga_translator.translators.VALID_LANGUAGES', _MOCK_LANGUAGES)
def test_chain_has_offline_false_for_online():
    """has_offline() returns False for online-only chains."""
    chain = TranslatorChain('chatgpt:ENG')
    with patch('manga_translator.translators.OFFLINE_TRANSLATORS', {}):
        assert chain.has_offline() is False


def test_chain_invalid_translator_raises():
    """Invalid translator name raises an exception (KeyError for unknown enum member)."""
    with pytest.raises(Exception):
        TranslatorChain('nonexistent_translator:ENG')


def test_chain_invalid_language_raises():
    """Invalid language code raises an exception."""
    with pytest.raises(Exception):
        TranslatorChain('sugoi:INVALID_LANG')


def test_chain_empty_string_raises():
    """Empty string raises Exception."""
    with pytest.raises(Exception):
        TranslatorChain('')


# --- SelectiveOfflineTranslator routing tests ---

def test_selective_routes_jpn_eng_to_sugoi():
    """JPN→ENG selects Sugoi translator."""
    from manga_translator.translators.selective import SelectiveOfflineTranslator

    mock_sugoi = MagicMock()
    mock_sugoi.supports_languages.return_value = True

    mock_m2m100 = MagicMock()

    def mock_get_translator(name):
        if name == 'sugoi':
            return mock_sugoi
        return mock_m2m100

    with patch('manga_translator.translators.selective.get_translator', mock_get_translator):
        translator = SelectiveOfflineTranslator()
        result = translator.select_translator('JPN', 'ENG')
        assert result is mock_sugoi


def test_selective_routes_other_to_m2m100():
    """ENG→THA falls back to m2m100_big since Sugoi doesn't support it."""
    from manga_translator.translators.selective import SelectiveOfflineTranslator

    mock_sugoi = MagicMock()
    mock_sugoi.supports_languages.return_value = False

    mock_m2m100 = MagicMock()

    def mock_get_translator(name):
        if name == 'sugoi':
            return mock_sugoi
        if name == 'm2m100_big':
            return mock_m2m100
        return MagicMock()

    with patch('manga_translator.translators.selective.get_translator', mock_get_translator):
        translator = SelectiveOfflineTranslator()
        result = translator.select_translator('ENG', 'THA')
        assert result is mock_m2m100


def test_selective_routes_auto_to_m2m100():
    """from_lang='auto' always falls back to m2m100_big."""
    from manga_translator.translators.selective import SelectiveOfflineTranslator

    mock_m2m100 = MagicMock()

    def mock_get_translator(name):
        if name == 'm2m100_big':
            return mock_m2m100
        return MagicMock()

    with patch('manga_translator.translators.selective.get_translator', mock_get_translator):
        translator = SelectiveOfflineTranslator()
        result = translator.select_translator('auto', 'ENG')
        assert result is mock_m2m100


# --- Smart routing tests (RunPod handler) ---

from server.smart_routing import build_smart_chain, apply_smart_routing


def test_smart_chain_eng_target():
    """ENG target uses sugoi directly."""
    assert build_smart_chain('ENG') == 'sugoi:ENG'


def test_smart_chain_jpn_target():
    """JPN target uses sugoi directly."""
    assert build_smart_chain('JPN') == 'sugoi:JPN'


def test_smart_chain_tha_target():
    """THA target uses nllb_big directly."""
    assert build_smart_chain('THA') == 'nllb_big:THA'


def test_smart_chain_kor_target():
    """KOR target uses two-hop: sugoi→chatgpt."""
    assert build_smart_chain('KOR') == 'sugoi:ENG;chatgpt:KOR'


def test_smart_chain_chs_target():
    """CHS target uses two-hop: sugoi→chatgpt."""
    assert build_smart_chain('CHS') == 'sugoi:ENG;chatgpt:CHS'


def test_apply_smart_routing_sets_chain():
    """apply_smart_routing sets translator_chain when none is specified."""
    config = Config()
    config.translator.target_lang = 'THA'
    config.translator.translator_chain = None
    config.translator.selective_translation = None

    result = apply_smart_routing(config)
    assert result.translator.translator_chain == 'nllb_big:THA'


def test_apply_smart_routing_skips_existing_chain():
    """apply_smart_routing does NOT override an explicit translator_chain."""
    config = Config()
    config.translator.translator_chain = 'chatgpt:THA'
    config.translator.selective_translation = None

    result = apply_smart_routing(config)
    assert result.translator.translator_chain == 'chatgpt:THA'


def test_apply_smart_routing_skips_selective():
    """apply_smart_routing does NOT override selective_translation."""
    config = Config()
    config.translator.translator_chain = None
    config.translator.selective_translation = 'sugoi:ENG;chatgpt:THA'

    result = apply_smart_routing(config)
    # translator_chain should remain None since selective is set
    assert result.translator.translator_chain is None


def test_apply_smart_routing_eng_target():
    """ENG target gets simple sugoi:ENG chain."""
    config = Config()
    config.translator.target_lang = 'ENG'
    config.translator.translator_chain = None
    config.translator.selective_translation = None

    result = apply_smart_routing(config)
    assert result.translator.translator_chain == 'sugoi:ENG'
