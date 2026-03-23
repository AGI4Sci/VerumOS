工作目录设定为/Applications/workspace/ailab/research/claw/VerumOS，阅读README.md, 和我一起debug项目。

目前web应用端口是:http://localhost:3000/
调试端口是: http://localhost:7681/

我的测试数据(3个.csv)和需求文档都放在/Users/zhangyanggao/Desktop/demo里面。以web端命名为"001"的job为例，你不需要反复上传数据和需求文档了，上传的功能完全没有问题，执行需求，拿到最终的整合数据集并存储在outputs, 都没有问题。

能不能帮我在job工作目录设置快照功能，然后在同一个job里面支持"编辑"历史信息和开启"新会话"。在"编辑"历史信息的时候，可以选择是否"revert"到操作前到版本。你之前已经实现了快照功能，需要走一遍完整的数据合并流程呢，请你端到端测试，修改，直到通过为止