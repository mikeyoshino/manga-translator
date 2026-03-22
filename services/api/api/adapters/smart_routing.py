"""
Smart translator routing for the RunPod worker.

Automatically selects the optimal translator chain based on target_lang.
"""

import logging

from manga_shared.config import Config

logger = logging.getLogger("smart_routing")

_SUGOI_LANGS = {'ENG', 'JPN'}


def build_smart_chain(target_lang: str) -> str:
    if target_lang in _SUGOI_LANGS:
        return f"sugoi:{target_lang}"
    return f"chatgpt:{target_lang}"


def apply_smart_routing(config: Config) -> Config:
    tc = config.translator
    if tc.translator_chain is not None or tc.selective_translation is not None:
        logger.info("Smart routing skipped: explicit chain/selective already set")
        return config

    target_lang = tc.target_lang
    chain = build_smart_chain(target_lang)
    logger.info("Smart routing: target_lang=%s → translator_chain='%s'", target_lang, chain)
    config.translator.translator_chain = chain
    return config
