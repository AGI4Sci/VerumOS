#!/bin/bash
set -e

BASE_URL="http://localhost:3000"

# 1. 创建会话
echo "=== 1. 创建会话 ==="
SESSION_RESP=$(curl -s -X POST "$BASE_URL/api/session")
echo "$SESSION_RESP" | jq .
SESSION_ID=$(echo "$SESSION_RESP" | jq -r '.sessionId')
JOB_ID=$(echo "$SESSION_RESP" | jq -r '.jobId')
echo "Session ID: $SESSION_ID"
echo "Job ID: $JOB_ID"

# 2. 保存需求文档（包含数据源）
echo -e "\n=== 2. 保存需求文档 ==="
curl -s -X POST "$BASE_URL/api/requirement/$SESSION_ID" \
  -H "Content-Type: application/json" \
  -d '{
    "jobId": "'$JOB_ID'",
    "title": "单细胞转录组分析",
    "status": "confirmed",
    "datasets": [
      {"file": "data/count_matrix.csv", "type": "表达矩阵", "description": "gene × cell"},
      {"file": "data/cell_metadata.csv", "type": "元数据", "description": "细胞信息"},
      {"file": "data/gene_annotation.csv", "type": "注释", "description": "基因注释"}
    ],
    "goals": ["细胞类型鉴定——识别肿瘤微环境中的免疫细胞亚群并完成注释"]
  }' | jq .

# 3. 执行分析
echo -e "\n=== 3. 执行分析 ==="
curl -s -X POST "$BASE_URL/api/chat" \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "'$SESSION_ID'",
    "message": "执行"
  }' | jq .

# 4. 检查输出
echo -e "\n=== 4. 检查输出目录 ==="
ls -la data/$JOB_ID/outputs/ 2>/dev/null || echo "No outputs yet"
cat data/$JOB_ID/analysis.py 2>/dev/null | head -30 || echo "No script yet"

# 5. 检查需求文档
echo -e "\n=== 5. 检查需求文档 ==="
cat data/$JOB_ID/requirement.md 2>/dev/null || echo "No requirement.md"
