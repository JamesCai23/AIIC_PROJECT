# STT 录音识别
curl -L -X POST 'https://openspeech.bytedance.com/api/v3/auc/bigmodel/query' \
-H 'Content-Type: application/json' \
-H 'x-api-key: 9419abfe-8d4d-4e3e-bd62-298b6d476660' \
-H 'X-Api-Resource-Id: volc.seedasr.auc' \
-H 'X-Api-Request-Id: d57752d3-6568-4cb5-ac30-750f933804e9' \
-d '{}'



Key

说明

Value 示例

X-Api-Key

使用火山引擎控制台获取的APP Key，可参考 快速入门（新版控制台）

123456789

X-Api-Resource-Id

表示调用服务的资源信息 ID

豆包录音文件识别模型1.0

volc.bigasr.auc
豆包录音文件识别模型2.0

volc.seedasr.auc
X-Api-Request-Id

用于提交和查询任务的任务ID，推荐传入随机生成的UUID

67ee89ba-7050-4c04-a3d7-ac61a63499b3

X-Api-Sequence

发包序号，固定值，-1

headers = {
    "X-Api-Key": apikey,
    "X-Api-Resource-Id": "volc.seedasr.auc",//资源ID
    "X-Api-Request-Id": task_id,
    "X-Api-Sequence": "-1"
}

# TTS
https://openspeech.bytedance.com/api/v3/tts/unidirectional

headers = {
    "X-Api-Key": "9419abfe-8d4d-4e3e-bd62-298b6d476660",
    "X-Api-Resource-Id": "seed-tts-2.0"
}

2 HTTP Chunked格式接口说明 #

2.1 请求Request #

请求路径 #
服务对应的请求路径：https://openspeech.bytedance.com/api/v3/tts/unidirectional

鉴权Request Headers #
使用新版控制台时，推荐采用以下更简化的鉴权方式。

Key

说明

参数类型

是否必须

Value示例

X-Api-Key

使用火山引擎控制台获取的API Key，可参考 控制台API Key管理

string

必须

"your-api-key"

X-Api-Resource-Id

表示调用服务的资源信息 ID，可以用来选择不同的模型版本效果，也决定了计费方式。

string

必须

豆包语音合成大模型
语音合成接口通过 X-Api-Resource-Id 参数来选择不同的版本效果：

seed-tts-2.0仅支持调用"豆包语音合成模型2.0"的音色
seed-tts-1.0 / seed-tts-1.0-concurr仅支持调用"豆包语音合成模型1.0"的音色
同时，X-Api-Resource-Id 也决定了计费方式：

seed-tts-2.0：对应计费商品为 “语音合成2.0字符版“
seed-tts-1.0：对应计费商品为“语音合成1.0字符版”
seed-tts-1.0-concurr：对应计费商品为“语音合成1.0并发版“
豆包声音复刻大模型
语音合成接口通过 X-Api-Resource-Id 参数来选择不同的版本效果：

seed-icl-2.0：对应声音复刻2.0 版本效果
seed-icl-1.0 / seed-icl-1.0-concurr：对应声音复刻1.0 版本效果
同时，X-Api-Resource-Id 也决定了计费方式：

seed-icl-2.0：对应计费商品为“声音复刻2.0 字符版”
seed-icl-1.0：对应计费商品为“声音复刻1.0 字符版”
seed-icl-1.0-concurr：对应计费商品为“声音复刻1.0 并发版”
X-Api-Request-Id

标识客户端请求ID，uuid随机字符串

string

可选

“67ee89ba-7050-4c04-a3d7-ac61a63499b3”

headers = {
    "X-Api-Key": "your-api-key",
    "X-Api-Resource-Id": "seed-tts-2.0"
}