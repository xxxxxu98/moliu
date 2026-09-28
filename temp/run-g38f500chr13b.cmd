@echo off
cd /d D:\project\2026\moliu
set MOLIU_CHAPTER_COUNT=500
set MOLIU_READER_JUDGE_PROVIDER_ID=provider-1787044972770
set MOLIU_STORYFLOW_RUN_SUFFIX=r13b
set MOLIU_STORYFLOW_MATRIX_DIR=temp\storyflow-matrix-g38f500chr13b
set MOLIU_TEST_TIMEOUT_MIN=7200
set MOLIU_STATE_CARD=1
node scripts/agent-storyflow-real-multi.mjs provider-1787044972770 > temp\g38f500chr13b-run.log 2>&1
