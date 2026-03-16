"""
Smart translator routing for the RunPod worker.

Automatically selects the optimal translator chain based on target_lang.
JPN↔ENG uses Sugoi (offline, best quality). Other targets get a two-hop
chain: sugoi:ENG → chatgpt:<target>.
"""

import logging

from manga_translator import Config

logger = logging.getLogger("smart_routing")

# Languages that Sugoi handles directly (JPN↔ENG)
_SUGOI_LANGS = {'ENG', 'JPN'}


def build_smart_chain(target_lang: str) -> str:
    """
    Build the optimal translator_chain string for a given target language.

    Rules:
      - ENG target → "sugoi:ENG"  (Sugoi JPN→ENG, best offline quality)
      - JPN target → "sugoi:JPN"  (Sugoi ENG→JPN)
      - Any other   → "sugoi:ENG;chatgpt:<target>"  (two-hop via English)

    Returns a translator_chain string like "sugoi:ENG;chatgpt:THA".
    """
    if target_lang in _SUGOI_LANGS:
        return f"sugoi:{target_lang}"
    return f"sugoi:ENG;chatgpt:{target_lang}"


def apply_smart_routing(config: Config) -> Config:
    """
    If the config has no explicit translator_chain or selective_translation,
    auto-select the best translator chain based on target_lang.

    This ensures the worker always uses the optimal path without requiring
    the client to know about translator internals.
    """
    tc = config.translator

    # Skip if user already specified a chain or selective routing
    if tc.translator_chain is not None or tc.selective_translation is not None:
        logger.info("Smart routing skipped: explicit chain/selective already set")
        return config

    target_lang = tc.target_lang
    chain = build_smart_chain(target_lang)

    logger.info("Smart routing: target_lang=%s → translator_chain='%s'", target_lang, chain)
    config.translator.translator_chain = chain

    return config
