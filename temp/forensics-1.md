# B轮 ch72 trace 文件 2 个: storyflow-agif200b-ch72-1788198538671.jsonl, storyflow-agif200b-ch72-1788198641031.jsonl

## storyflow-agif200b-ch72-1788198538671.jsonl (6 行)
- keys=[seq,runId,purpose,schemaName,system,prompt,response,rawResponse,ms,at] purpose=scene-draft respShape=object(keys=sceneId|beatId|paragraphs|candidateEvents|chapterTitle)
- keys=[seq,runId,purpose,schemaName,system,prompt,response,rawResponse,ms,at] purpose=fact-extraction respShape=object(keys=events|deltas|evidence|candidateVerdicts)
- keys=[seq,runId,purpose,schemaName,system,prompt,response,rawResponse,ms,at] purpose=chapter-judge respShape=object(keys=fulfillment|forbidden|issues|resolvedForeshadowIds)
- keys=[seq,runId,purpose,schemaName,system,prompt,response,rawResponse,ms,at] purpose=scene-draft respShape=object(keys=sceneId|beatId|paragraphs|candidateEvents|chapterTitle)
- keys=[seq,runId,purpose,schemaName,system,prompt,response,rawResponse,ms,at] purpose=fact-extraction respShape=object(keys=events|deltas|evidence|candidateVerdicts)
- keys=[seq,runId,purpose,schemaName,system,prompt,response,rawResponse,ms,at] purpose=chapter-judge respShape=object(keys=fulfillment|forbidden|issues|resolvedForeshadowIds)

## storyflow-agif200b-ch72-1788198641031.jsonl (4 行)
- keys=[seq,runId,purpose,schemaName,system,prompt,response,rawResponse,ms,at] purpose=scene-draft respShape=object(keys=sceneId|beatId|paragraphs|candidateEvents|chapterTitle)
- keys=[seq,runId,purpose,schemaName,system,prompt,response,rawResponse,ms,at] purpose=scene-draft respShape=ARRAY(len=4)
  ⚠ 数组响应原文(前600字): ["柳文瀚收回手，长长叹了一口气，压低声音道：“通政使赵元泰是崔相的铁杆门生，通政司名义上掌管天下奏章与边关公文出入，实则是崔党卡在内外枢纽上的一把铁锁。你要查通政司的原始底册，无异于直接伸手去拔赵元泰的虎须。文选司刚被抄没，通政司此刻必定如惊弓之鸟，若没有雷霆手段，他们绝不可能将真正的签收底根交出来。”","顾承安将桌案上的审计图纸利落折叠收入袖中，神色冷峻如铁：“正因他们是惊弓之鸟，我们才更要打他们一个措手不及。在现代审计体系里，做假账的一方在遭遇突击查账时，慌乱之下必然会自露马脚。陛下此前赐予考成统筹处专断之权，凡涉及量化考成之底档，六部九卿皆无权推诿阻挠。”他转头看向沈若兰，沉声吩咐道，“若兰，备齐统筹处的调档关防与御赐信物，今夜通政司的门，我们非进不可。”","话音未落，值房门外忽然传来一阵急促沉重的脚步声。亲信周成一把推开房门疾步而入，公服下摆沾满夜露，神色凝重地抱拳禀道：“掌道，属下按您的吩咐在通政司衙门外暗中盯梢，半柱香前通政使赵元泰突然连夜密召属下，借口西库返潮生蠹，正指使十余名心腹书吏将这几年的边关驿传签收底簿尽数装箱，看样子是要连夜运往城外私宅！”","“好一个返潮生蠹，他们这是做贼心虚，想把这唯一的死证运出城去一把火烧个干净。”柳文瀚眼中闪过一丝怒色，沉声道，“赵元泰在通政司经营多年，若非被逼到了悬崖边，绝不敢在深夜私自挪动关防底卷。”顾承安迈步越过桌案，目
- keys=[seq,runId,purpose,schemaName,system,prompt,response,rawResponse,ms,at] purpose=fact-extraction respShape=object(keys=events|deltas|evidence|candidateVerdicts)
- keys=[seq,runId,purpose,schemaName,system,prompt,error,ms,at] purpose=chapter-judge respShape=n/a
  error: 章节语义审查结果 结构校验失败: ✖ Invalid input: expected object, received array


# A轮 脏实体扫描 「登场并提供黑市」
命中 542 处(每文件至多取3处)

- 文件: storyflow-agif200a-1788189254864.project-store.json
  上下文: …入室内。\n\n--- 结构化节点 ---\n【CBN】素手掀开竹帘，一缕冷香伴着茶香飘入室内。\n【CPNs】苏清婉化名登场与沈淮安在文书库偏厅对账\n双方以情报和官面护佑达成初次交易\n沈淮安完成黑市与官粮的数据交叉稽核。\n【CEN】苏清婉眸光闪动留下一句意味深长的提醒。\n【必须覆盖】苏清婉登场并提供黑市粮价情报、沈淮安完成官粮流向交叉审计\n【禁区】苏清婉暴露全套灭门身世、主角对苏清婉完全交底",           "plotSummary": "CBN: 素手掀开竹帘，一缕冷香伴着茶香飘入室内。\nCEN: 苏清婉眸光闪动留下一句意味深长的提醒。"         },     …

- 文件: storyflow-agif200a-1788189254864.project-store.json
  上下文: …记入表。",             "level": "city",             "parentId": ""           },           {             "id": "loc-1788189629025-2",             "name": "登场并提供黑市",             "description": "卷纲与章节蓝图引用的地点，补登记入表。",             "level": "city",             "parentId": ""           },           {          …

- 文件: storyflow-agif200a-1788189254864.project-store.json
  上下文: …"title": "第8章 听雨轩暗通情报，截获黑市粮价",           "description": "素手掀开竹帘，一缕冷香伴着茶香飘入室内。",           "type": "chapter",           "keyEvents": [             "苏清婉登场并提供黑市粮价情报",             "沈淮安完成官粮流向交叉审计"           ],           "relatedCharacters": [],           "orderIndex": 7,           "CBN": "素手掀开竹帘，一缕冷香伴着茶香…

- 文件: storyflow-agif200a-ch1-1788190743372.jsonl
  上下文: …nd\":\"location\"},{\"id\":\"loc-1788189629025-1\",\"name\":\"截获黑市\",\"aliases\":[],\"kind\":\"location\"},{\"id\":\"loc-1788189629025-2\",\"name\":\"登场并提供黑市\",\"aliases\":[],\"kind\":\"location\"},{\"id\":\"loc-1788189629025-3\",\"name\":\"大奉大理寺文书库\",\"aliases\":[],\"kind\":\"location\"},{\"id\":\"…

- 文件: storyflow-agif200a-ch1-1788190743372.jsonl
  上下文: …"location\",\"attributes\":{\"description\":\"卷纲与章节蓝图引用的地点，补登记入表。\",\"parentId\":\"\",\"level\":\"city\"}},{\"id\":\"loc-1788189629025-2\",\"name\":\"登场并提供黑市\",\"kind\":\"location\",\"attributes\":{\"description\":\"卷纲与章节蓝图引用的地点，补登记入表。\",\"parentId\":\"\",\"level\":\"city\"}},{\"id\":\"loc-178818962…

- 文件: storyflow-agif200a-ch10-1788191867753.jsonl
  上下文: …nd\":\"location\"},{\"id\":\"loc-1788189629025-1\",\"name\":\"截获黑市\",\"aliases\":[],\"kind\":\"location\"},{\"id\":\"loc-1788189629025-2\",\"name\":\"登场并提供黑市\",\"aliases\":[],\"kind\":\"location\"},{\"id\":\"loc-1788189629025-3\",\"name\":\"大奉大理寺文书库\",\"aliases\":[],\"kind\":\"location\"},{\"id\":\"…

- 文件: storyflow-agif200a-ch10-1788191867753.jsonl
  上下文: …"location\",\"attributes\":{\"description\":\"卷纲与章节蓝图引用的地点，补登记入表。\",\"parentId\":\"\",\"level\":\"city\"}},{\"id\":\"loc-1788189629025-2\",\"name\":\"登场并提供黑市\",\"kind\":\"location\",\"attributes\":{\"description\":\"卷纲与章节蓝图引用的地点，补登记入表。\",\"parentId\":\"\",\"level\":\"city\"}},{\"id\":\"loc-178818962…

- 文件: storyflow-agif200a-ch100-1788202108462.jsonl
  上下文: …nd\":\"location\"},{\"id\":\"loc-1788189629025-1\",\"name\":\"截获黑市\",\"aliases\":[],\"kind\":\"location\"},{\"id\":\"loc-1788189629025-2\",\"name\":\"登场并提供黑市\",\"aliases\":[],\"kind\":\"location\"},{\"id\":\"loc-1788189629025-3\",\"name\":\"大奉大理寺文书库\",\"aliases\":[],\"kind\":\"location\"},{\"id\":\"…

- 文件: storyflow-agif200a-ch100-1788202108462.jsonl
  上下文: …"location\",\"attributes\":{\"description\":\"卷纲与章节蓝图引用的地点，补登记入表。\",\"parentId\":\"\",\"level\":\"city\"}},{\"id\":\"loc-1788189629025-2\",\"name\":\"登场并提供黑市\",\"kind\":\"location\",\"attributes\":{\"description\":\"卷纲与章节蓝图引用的地点，补登记入表。\",\"parentId\":\"\",\"level\":\"city\"}},{\"id\":\"loc-178818962…

- 文件: storyflow-agif200a-ch100-1788202108462.jsonl
  上下文: …nd\":\"location\"},{\"id\":\"loc-1788189629025-1\",\"name\":\"截获黑市\",\"aliases\":[],\"kind\":\"location\"},{\"id\":\"loc-1788189629025-2\",\"name\":\"登场并提供黑市\",\"aliases\":[],\"kind\":\"location\"},{\"id\":\"loc-1788189629025-3\",\"name\":\"大奉大理寺文书库\",\"aliases\":[],\"kind\":\"location\"},{\"id\":\"…

- 文件: storyflow-agif200a-ch101-1788202197748.jsonl
  上下文: …nd\":\"location\"},{\"id\":\"loc-1788189629025-1\",\"name\":\"截获黑市\",\"aliases\":[],\"kind\":\"location\"},{\"id\":\"loc-1788189629025-2\",\"name\":\"登场并提供黑市\",\"aliases\":[],\"kind\":\"location\"},{\"id\":\"loc-1788189629025-3\",\"name\":\"大奉大理寺文书库\",\"aliases\":[],\"kind\":\"location\"},{\"id\":\"…

- 文件: storyflow-agif200a-ch101-1788202197748.jsonl
  上下文: …"location\",\"attributes\":{\"description\":\"卷纲与章节蓝图引用的地点，补登记入表。\",\"parentId\":\"\",\"level\":\"city\"}},{\"id\":\"loc-1788189629025-2\",\"name\":\"登场并提供黑市\",\"kind\":\"location\",\"attributes\":{\"description\":\"卷纲与章节蓝图引用的地点，补登记入表。\",\"parentId\":\"\",\"level\":\"city\"}},{\"id\":\"loc-178818962…

# A轮 project-store 顶层键: projects
未找到 stateSummary.entities,试扫所有 name 字段含「登场」的:
name含登场: ["登场并提供黑市"]