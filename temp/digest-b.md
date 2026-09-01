# B轮 summary digest
status=complete requested=200 completed=200 chapters字段=50
phaseTimings={"outlineDirectionsMs":19534,"outlineExpandMs":316127,"outlineRollMs":1182784,"applyOutlineMs":895,"continueWriteMs":23412473,"totalMs":24931813}
batch条目数=200

## 异常章(error/未accept/0字) 共1条
- ch72 acc=false words=0 attempts=5 rewrites=0 title=第72章
  error="[review-unavailable] 语义审查不可用：章节语义审查结果 结构校验失败: ✖ Invalid input: expected object, received array"
  gateIssues=[]

## ch72 完整条目
```json
{
 "ch": 72,
 "accepted": false,
 "title": "第72章",
 "words": 0,
 "paras": 0,
 "paraCv": 0,
 "attempts": 5,
 "rewriteRounds": 0,
 "gateIssues": [],
 "head": "",
 "tail": "",
 "error": "[review-unavailable] 语义审查不可用：章节语义审查结果 结构校验失败: ✖ Invalid input: expected object, received array"
}
```

attempts分布={"1":199,"5":1} rewriteRounds分布={"0":146,"1":54}
words min/max/avg=0/3533/2965
gateIssues聚合={"[object Object]":14}

## outlineWarnings 30条
- 单章蓝图补全批次 11-20 瞬态失败（第 1 次，API 未返回内容），2000ms 后重试
- 单章蓝图补全批次 41-50 瞬态失败（第 1 次，API 未返回内容），2000ms 后重试
- 单章蓝图补全批次第 4 章响应不可用（解析失败或字段缺失），本章保留原稿
- 单章蓝图补全批次 1-10 仍有 7/10 章未解出（第 4、5、6、7、8、9、10 章）
- 单章蓝图补全批次第 18 章响应不可用（解析失败或字段缺失），本章保留原稿
- 单章蓝图补全批次 11-20 仍有 3/10 章未解出（第 18、19、20 章）
- 单章蓝图补全批次 21-30 仍有 2/10 章未解出（第 29、30 章）
- 单章蓝图补全批次第 37 章响应不可用（解析失败或字段缺失），本章保留原稿
- 单章蓝图补全批次 31-40 仍有 4/10 章未解出（第 37、38、39、40 章）
- 单章蓝图补全批次 41-50 仍有 3/10 章未解出（第 48、49、50 章）
- 单章蓝图补全后仍有 19 章不完整，执行第 1 轮定点修复：4、5、6、7、8、9、10、18、19、20、29、30、37、38、39、40、48、49、50
- 单章蓝图定点修复批次第 5 章响应不可用（解析失败或字段缺失），本章保留原稿

## readerEvaluation 评审数=0 min=undefined p10=undefined p25=undefined median=undefined
issues总数=0 blocking=0

projectStorageVerification={"chapterCount":50,"plotChapterCount":50,"linkedPlotChapterCount":50,"structuredPlotChapterCount":50,"characterCount":12,"foreshadowCount":10,"volumeCount":1,"chapterOutlineTextCount":50,"coldReloadVerified":true,"criticalDataHash":"b1a51b3a18cdc3a3e67ec8845b8aef123318728c56a6ff74a7ff5381d0db6b0b","completeCharacterProfileCount":12,"positioningPersisted":true}

顶层键=book,mode,status,scenarioId,evaluationVersion,promptSource,promptChars,requestedChapterCount,phaseTimings,completedChapters,chapters,outlinePath,proseDir,batch,plotOutlineTitles,runtimeBackend,runtimeBackendAuthentic,runtimeVerification,projectStorageVerification,postWritePersistence,outlineWarnings,repairMetrics,runtimeMetrics,readerEvaluation,provider,model,totalMs,warnings