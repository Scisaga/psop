"""Compatibility entry points for the maintained native PSOP diagrams.

The learning and platform pages share the current Microduck teaching case and
are authored in learning_platform_pages.py, so builds need no external deck.
"""
from learning_platform_pages import experience_loop, platform_architecture

__all__ = ['experience_loop', 'platform_architecture']
