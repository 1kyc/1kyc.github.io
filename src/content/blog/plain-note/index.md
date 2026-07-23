---
title: 'A Plain Note, in Three Scripts'
description: 'A short, TOC-less post that also exercises trilingual rendering — English, Simplified Chinese, and Japanese, each in its own Noto Sans face.'
pubDate: 2026-07-23
tags: ['meta', 'demo', 'i18n']
lang: en
draft: true
---

A short note, and a quick check of the trilingual type system. There are no
section headings here, so no table of contents appears — the reading column just
sits centered in the page, the same as a post that *does* have a sidebar.

<!--more-->

What follows is the same small thought in three scripts. Each block is tagged
with its own `lang`, so it renders in the right Noto Sans face while the line
length and rhythm stay identical across all three.

<p lang="zh-Hans">这是用简体中文写的一段。汉字应当以 Noto Sans SC 的字形显示，而其中的拉丁词——比如 Astro——仍旧留在西文阅读字体里。行宽和行间的节奏，与上面的英文保持一致。</p>

<p lang="ja">こちらは日本語の段落です。仮名と漢字は Noto Sans JP の字形で表示され、同じ漢字でも中国語とは形が少し異なります。読みやすさを保つために、行間と字間はそのままにしています。</p>

Back in English to close. The point isn't the words — it's that the measure and
the rhythm hold steady whether the line is filled with Latin letters or CJK
glyphs, and that Simplified Chinese and Japanese each get their own regional
shapes rather than one font standing in for both.

> Tagged correctly, the same character can take a different shape in each
> language — which is exactly why the `lang` attribute, not just the font, does
> the work.
