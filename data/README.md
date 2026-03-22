# data/

运行时上传的 CSV / TSV / Excel 文件默认保存在这里。

- 开发时可将测试数据手动放入 `data/`
- 仓库默认只追踪 `data/.gitkeep` 和本说明文件
- 前端上传接口 `POST /api/upload` 也会将文件保存到本目录
