---
title: 'Hello, world'
description: 'The first post — wiring up the blog pipeline end to end.'
pubDate: 2026-07-13
tags: ['meta', 'astro']
---

Welcome to the blog. This first post exists to exercise the content pipeline
from frontmatter to rendered page: a folder-per-post entry, a typed schema, and
a route that renders the body.

<!--more-->

## Why a folder per post

Each post lives at `src/content/blog/<slug>/index.md`, so images and other
assets can sit right next to the words that reference them. The slug is just the
folder name — no date prefix to keep in sync.

## What's next

Later phases layer on the nice-to-haves: syntax highlighting, math, a table of
contents, tags pages, and search. For now the foundation is deliberately plain —
markdown in, HTML out.
