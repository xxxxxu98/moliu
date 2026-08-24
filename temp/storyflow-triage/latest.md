# Storyflow 冒烟质量报告

- 生成时间：2026-08-24T13:51:56.442Z
- 数据源：D:\project\2026\moliu\temp\storyflow-matrix

| 模型 | 工程结果 | 判定 | 章节 | 首过率 | 读者大纲分 | 读者章节均分/最低 |
|---|---|---|---:|---:|---:|---:|
| gemini-3.7-flash-high | 通过 | passed-with-repairs | 1/1 | 100% | - | -/- |
| gemini-3.6-flash-high | 失败 | clean | 0 | - | - | -/- |

## gemini-3.7-flash-high

质量问题/空响应均被章内压缩或重试兜住，最终通过

| 级别 | 签名 | 章节 | 次数 | 证据 |
|---|---|---:|---:|---|
| 黄 | model.empty-response | - | 2 | trace storyflow-provider-1787039781123-reader-1787579391858.jsonl seq1 reader-outline-judge 响应 2 字符 |
| 黄 | reader.evaluation-error | - | 2 | 大纲读者评审失败：[
  {
    "expected": "string",
    "code": "invalid_type",
    "path": [
      "summary"
    ],
    "message": "Invalid input: expected string, receiv |
| 黄 | model.empty-response | 1 | 1 | trace storyflow-provider-1787039781123-ch1-1787579299306.jsonl seq1 scene-draft 响应 2 字符 |

## gemini-3.6-flash-high

无异常签名

无异常签名。
