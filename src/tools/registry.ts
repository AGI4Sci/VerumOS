import type { ChatCompletionTool } from "openai/resources/chat/completions.js";

// Tool definitions for OpenAI-compatible API
export const BIO_TOOLS: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "search_pubmed",
      description:
        "Search PubMed for biomedical literature. Returns paper titles, abstracts, authors, and publication dates. Use this to find evidence for or against a hypothesis.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description:
              "PubMed search query (supports MeSH terms and Boolean operators)",
          },
          max_results: {
            type: "integer",
            description: "Number of results to return (default: 5, max: 10)",
          },
          since_year: {
            type: "integer",
            description:
              "Filter papers published from this year onwards (optional)",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_semantic_scholar",
      description:
        "Search Semantic Scholar for papers with citation counts and influence scores. Best for assessing evidence strength and finding highly-cited studies.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Search query",
          },
          max_results: {
            type: "integer",
            description: "Number of results (default: 5)",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_gene_info",
      description:
        "Get detailed gene information from NCBI Gene database, including function, pathways, associated diseases, and expression data.",
      parameters: {
        type: "object",
        properties: {
          gene_symbol: {
            type: "string",
            description: "Official gene symbol, e.g. BRCA1, TP53, EGFR",
          },
          species: {
            type: "string",
            description: "Species (default: 'human')",
          },
        },
        required: ["gene_symbol"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_protein_interactions",
      description:
        "Query STRING database for protein-protein interaction network. Returns interacting partners and confidence scores.",
      parameters: {
        type: "object",
        properties: {
          gene_symbol: {
            type: "string",
            description: "Gene/protein symbol",
          },
          min_score: {
            type: "integer",
            description: "Minimum interaction score 0-1000 (default: 400)",
          },
          max_interactions: {
            type: "integer",
            description: "Max number of interactions to return (default: 10)",
          },
        },
        required: ["gene_symbol"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_clinical_trials",
      description:
        "Search ClinicalTrials.gov for relevant clinical studies. Returns trial status, phase, and key findings.",
      parameters: {
        type: "object",
        properties: {
          condition: {
            type: "string",
            description: "Disease or condition (e.g. 'breast cancer')",
          },
          intervention: {
            type: "string",
            description: "Drug, treatment, or intervention (optional)",
          },
          status: {
            type: "string",
            enum: ["RECRUITING", "COMPLETED", "ALL"],
            description: "Trial status filter",
          },
          max_results: {
            type: "integer",
            description: "Max trials to return (default: 5)",
          },
        },
        required: ["condition"],
      },
    },
  },
];

// Tool input types
export interface PubMedInput {
  query: string;
  max_results?: number;
  since_year?: number;
}

export interface SemanticScholarInput {
  query: string;
  max_results?: number;
}

export interface GeneInfoInput {
  gene_symbol: string;
  species?: string;
}

export interface ProteinInteractionsInput {
  gene_symbol: string;
  min_score?: number;
  max_interactions?: number;
}

export interface ClinicalTrialsInput {
  condition: string;
  intervention?: string;
  status?: "RECRUITING" | "COMPLETED" | "ALL";
  max_results?: number;
}