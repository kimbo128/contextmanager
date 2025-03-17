#!/usr/bin/env node

import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { z } from "zod";
import path from "path";
import { fileURLToPath } from "url";

// Get the directory where the contextmanager is located
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Domain interfaces
interface DomainInfo {
  name: string;
  description: string;
  entityTypes: string[];
  host?: string;
  port?: number;
  path?: string;
  command?: string;
  args?: string[];
}

interface SessionInfo {
  id: string;
  domain: string;
  entityName?: string;
  entityType?: string;
  active: boolean;
  createdAt: number;
}

// Domain client class
class DomainClient {
  public name: string;
  public client: Client | null = null;
  public transport: SSEClientTransport | StdioClientTransport | null = null;
  public connected: boolean = false;
  private process: any = null;

  constructor(public domain: DomainInfo) {
    this.name = domain.name;
  }

  async connect(): Promise<boolean> {
    if (this.connected) {
      return true;
    }

    try {
      // Create client
      this.client = new Client(
        {
          name: `contextmanager-${this.name}-client`,
          version: "1.0.0"
        },
        {
          capabilities: {
            resources: {},
            tools: {},
            prompts: {}
          }
        }
      );

      // Connect to domain server
      if (this.domain.host && this.domain.port) {
        // Connect via SSE
        const url = new URL(`http://${this.domain.host}:${this.domain.port}${this.domain.path || '/sse'}`);
        this.transport = new SSEClientTransport(url);
      } else if (this.domain.command) {
        // Connect via stdio
        this.transport = new StdioClientTransport({
          command: this.domain.command,
          args: this.domain.args || [],
        });
      } else {
        console.error(`Domain ${this.name} has no connection information`);
        return false;
      }

      await this.client.connect(this.transport);
      this.connected = true;
      return true;
    } catch (error) {
      console.error(`Failed to connect to domain ${this.name}:`, error);
      this.connected = false;
      return false;
    }
  }

  async disconnect(): Promise<void> {
    if (!this.connected) {
      return;
    }

    try {
      if (this.client) {
        // Manually close the transport as there's no official disconnect method
        if (this.transport) {
          if ('close' in this.transport) {
            await (this.transport as any).close();
          }
        }
      }
      this.connected = false;
    } catch (error) {
      console.error(`Error disconnecting from domain ${this.name}:`, error);
    }
  }

  async callTool(toolRequest: { name: string; arguments: any }): Promise<any> {
    if (!this.connected || !this.client) {
      const connected = await this.connect();
      if (!connected) {
        return {
          content: [{ type: "text", text: `Error: Not connected to domain ${this.name}` }],
          isError: true
        };
      }
    }

    try {
      if (!this.client) {
        throw new Error(`Client for domain ${this.name} is not initialized`);
      }
      
      const result = await this.client.callTool(toolRequest);
      return result;
    } catch (error) {
      console.error(`Error calling tool ${toolRequest.name} on domain ${this.name}:`, error);
      return {
        content: [{ type: "text", text: `Error calling tool ${toolRequest.name} on domain ${this.name}: ${error}` }],
        isError: true
      };
    }
  }

  async readResource(resourceRequest: { uri: string }): Promise<any> {
    if (!this.connected || !this.client) {
      const connected = await this.connect();
      if (!connected) {
        return {
          contents: [{
            uri: resourceRequest.uri,
            text: `Error: Not connected to domain ${this.name}`
          }]
        };
      }
    }

    try {
      if (!this.client) {
        throw new Error(`Client for domain ${this.name} is not initialized`);
      }
      
      return await this.client.readResource(resourceRequest);
    } catch (error) {
      console.error(`Error reading resource ${resourceRequest.uri} from domain ${this.name}:`, error);
      return {
        contents: [{
          uri: resourceRequest.uri,
          text: `Error reading resource: ${error}`
        }]
      };
    }
  }
}

// In-memory storage
const domains: DomainInfo[] = [
  {
    name: "developer",
    description: "Software development context with entities like projects, components, and tasks",
    entityTypes: ["project", "component", "task", "issue", "commit"],
    command: "node",
    args: [path.resolve(__dirname, "../domains/developer/index.js")]
  },
  {
    name: "project",
    description: "Project management context with entities like projects, tasks, and resources",
    entityTypes: ["project", "task", "resource", "milestone", "risk"],
    command: "node",
    args: [path.resolve(__dirname, "../domains/project/index.js")]
  },
  {
    name: "student",
    description: "Educational context with entities like courses, assignments, and exams",
    entityTypes: ["course", "assignment", "exam", "note", "grade"],
    command: "node",
    args: [path.resolve(__dirname, "../domains/student/index.js")]
  },
  {
    name: "qualitativeresearch",
    description: "Qualitative research context with entities like studies, participants, and interviews",
    entityTypes: ["study", "participant", "interview", "code", "theme"],
    command: "node",
    args: [path.resolve(__dirname, "../domains/qualitativeresearch/index.js")]
  },
  {
    name: "quantitativeresearch",
    description: "Quantitative research context with entities like datasets, variables, and analyses",
    entityTypes: ["dataset", "variable", "analysis", "model", "result"],
    command: "node",
    args: [path.resolve(__dirname, "../domains/quantitativeresearch/index.js")]
  }
];

// Domain clients
const domainClients: { [key: string]: DomainClient } = {};

// Initialize domain clients
for (const domain of domains) {
  domainClients[domain.name] = new DomainClient(domain);
}

// In-memory session management
const sessions: SessionInfo[] = [];
let activeDomain: string | null = null;
let sessionCounter = 0;

// Create an MCP server
const server = new McpServer({
  name: "Context Manager",
  version: "1.0.0"
});

// Domain management tools
server.tool(
  "setActiveDomain",
  { domain: z.string() },
  async ({ domain }) => {
    const foundDomain = domains.find(d => d.name.toLowerCase() === domain.toLowerCase());
    if (!foundDomain) {
      return {
        content: [{ type: "text", text: `Error: Domain '${domain}' not found. Available domains: ${domains.map(d => d.name).join(", ")}` }],
        isError: true
      };
    }
    
    // Connect to the domain server
    const domainClient = domainClients[foundDomain.name];
    const connected = await domainClient.connect();
    
    if (!connected) {
      return {
        content: [{ type: "text", text: `Error: Could not connect to domain server for '${domain}'` }],
        isError: true
      };
    }
    
    activeDomain = foundDomain.name;
    
    return {
      content: [{ type: "text", text: `Active domain set to: ${activeDomain}` }]
    };
  }
);

// Session management tools
server.tool(
  "startsession",
  { 
    domain: z.string(),
    random_string: z.string().optional()
  },
  async ({ domain }) => {
    const foundDomain = domains.find(d => d.name.toLowerCase() === domain.toLowerCase());
    if (!foundDomain) {
      return {
        content: [{ type: "text", text: `Error: Domain '${domain}' not found. Available domains: ${domains.map(d => d.name).join(", ")}` }],
        isError: true
      };
    }
    
    // Connect to the domain server
    const domainClient = domainClients[foundDomain.name];
    const connected = await domainClient.connect();
    
    if (!connected) {
      return {
        content: [{ type: "text", text: `Error: Could not connect to domain server for '${domain}'` }],
        isError: true
      };
    }
    
    activeDomain = foundDomain.name;
    sessionCounter++;
    
    // Create a contextmanager session ID
    const cmSessionId = `cm_session_${activeDomain}_${sessionCounter}_${Date.now()}`;
    
    sessions.push({
      id: cmSessionId,
      domain: activeDomain,
      active: true,
      createdAt: Date.now()
    });

    // Forward the startsession call to the domain server with a domain-specific session identifier
    try {
      const domainRandomString = `${activeDomain}_session_from_cm_${Date.now()}`;
      const result = await domainClient.callTool({
        name: "startsession",
        arguments: {
          domain: activeDomain,
          random_string: domainRandomString
        }
      });
      
      return {
        content: [{ type: "text", text: `${result.content[0].text}\n\nNew Context Manager session started with session ID: ${cmSessionId}` }]
      };
    } catch (error) {
      console.error(`Error starting session for domain ${activeDomain}:`, error);
      return {
        content: [{ type: "text", text: `Error starting session for domain ${activeDomain}: ${error}` }],
        isError: true
      };
    }
  }
);

server.tool(
  "endsession",
  {
    sessionId: z.string(),
    stage: z.string(),
    stageNumber: z.number(),
    totalStages: z.number(),
    nextStageNeeded: z.boolean(),
    analysis: z.string().optional(),
    isRevision: z.boolean().optional(),
    revisesStage: z.number().optional(),
    stageData: z.any().optional()
  },
  async ({ sessionId, stage, stageNumber, totalStages, nextStageNeeded, analysis, isRevision, revisesStage, stageData }) => {
    const sessionIndex = sessions.findIndex(s => s.id === sessionId);
    if (sessionIndex === -1) {
      return {
        content: [{ type: "text", text: `Error: Context Manager session with ID '${sessionId}' not found.` }],
        isError: true
      };
    }
    
    const session = sessions[sessionIndex];
    const domainName = session.domain;
    const domainClient = domainClients[domainName];
    
    if (!domainClient || !domainClient.connected) {
      const connected = await domainClient.connect();
      if (!connected) {
        return {
          content: [{ type: "text", text: `Error: Could not connect to domain server for '${domainName}'` }],
          isError: true
        };
      }
    }
    
    // Create a domain-specific session ID for ending
    const domainSessionId = `${domainName}_session_${sessionId}`;
    
    // Forward the endsession call to the domain server
    try {
      const result = await domainClient.callTool({
        name: "endsession",
        arguments: {
          sessionId: domainSessionId,
          stage,
          stageNumber,
          totalStages,
          nextStageNeeded,
          analysis,
          isRevision,
          revisesStage,
          stageData
        }
      });
      
      if (!nextStageNeeded) {
        sessions[sessionIndex].active = false;
        return {
          content: [{ type: "text", text: `${result.content[0].text}\n\nContext Manager session ${sessionId} has been ended.` }]
        }
      }
      
      return {
        content: [{ type: "text", text: `${result.content[0].text}` }]
      };
    } catch (error) {
      console.error(`Error ending session for domain ${domainName}:`, error);
      return {
        content: [{ type: "text", text: `Error ending session for domain ${domainName}: ${error}` }],
        isError: true
      };
    }
  }
);

// Context management tools
server.tool(
  "buildcontext",
  {
    type: z.enum(["entities", "relations", "observations"]),
    data: z.any().optional()
  },
  async ({ type, data }) => {
    if (!activeDomain) {
      return {
        content: [{ type: "text", text: "Error: No active domain set. Use setActiveDomain tool first." }],
        isError: true
      };
    }

    const domainClient = domainClients[activeDomain];
    
    if (!domainClient || !domainClient.connected) {
      const connected = await domainClient.connect();
      if (!connected) {
        return {
          content: [{ type: "text", text: `Error: Could not connect to domain server for '${activeDomain}'` }],
          isError: true
        };
      }
    }
    
    // Forward the buildcontext call to the domain server
    try {
      const result = await domainClient.callTool({
        name: "buildcontext",
        arguments: {
          type,
          data
        }
      });
      
      return result;
    } catch (error) {
      console.error(`Error building context for domain ${activeDomain}:`, error);
      return {
        content: [{ type: "text", text: `Error building context for domain ${activeDomain}: ${error}` }],
        isError: true
      };
    }
  }
);

server.tool(
  "deletecontext",
  {
    type: z.enum(["entities", "relations", "observations"]),
    data: z.any().optional()
  },
  async ({ type, data }) => {
    if (!activeDomain) {
      return {
        content: [{ type: "text", text: "Error: No active domain set. Use setActiveDomain tool first." }],
        isError: true
      };
    }

    const domainClient = domainClients[activeDomain];
    
    if (!domainClient || !domainClient.connected) {
      const connected = await domainClient.connect();
      if (!connected) {
        return {
          content: [{ type: "text", text: `Error: Could not connect to domain server for '${activeDomain}'` }],
          isError: true
        };
      }
    }
    
    // Forward the deletecontext call to the domain server
    try {
      const result = await domainClient.callTool({
        name: "deletecontext",
        arguments: {
          type,
          data
        }
      });
      
      return result;
    } catch (error) {
      console.error(`Error deleting context for domain ${activeDomain}:`, error);
      return {
        content: [{ type: "text", text: `Error deleting context for domain ${activeDomain}: ${error}` }],
        isError: true
      };
    }
  }
);

server.tool(
  "loadcontext",
  {
    entityName: z.string(),
    entityType: z.string().optional(),
    sessionId: z.string().optional()
  },
  async ({ entityName, entityType, sessionId }) => {
    if (!activeDomain) {
      return {
        content: [{ type: "text", text: "Error: No active domain set. Use setActiveDomain tool first." }],
        isError: true
      };
    }

    // Find active contextmanager session or use provided sessionId
    let targetSession: SessionInfo | undefined;
    if (sessionId) {
      targetSession = sessions.find(s => s.id === sessionId);
    } else {
      targetSession = sessions.find(s => s.domain === activeDomain && s.active);
    }

    if (!targetSession) {
      return {
        content: [{ type: "text", text: "Error: No active Context Manager session found. Start a session first." }],
        isError: true
      };
    }

    const domainClient = domainClients[activeDomain];
    
    if (!domainClient || !domainClient.connected) {
      const connected = await domainClient.connect();
      if (!connected) {
        return {
          content: [{ type: "text", text: `Error: Could not connect to domain server for '${activeDomain}'` }],
          isError: true
        };
      }
    }
    
    // Update contextmanager session with entity details
    targetSession.entityName = entityName;
    targetSession.entityType = entityType || "unknown";

    // Create domain-specific session ID
    const domainSessionId = `${activeDomain}_session_${targetSession.id}`;

    // Forward the loadcontext call to the domain server
    try {
      const result = await domainClient.callTool({
        name: "loadcontext",
        arguments: {
          entityName,
          entityType,
          sessionId: domainSessionId
        }
      });
      
      return {
        content: [{ 
          type: "text", 
          text: `${result.content[0].text}`
        }]
      };
    } catch (error) {
      console.error(`Error loading context for domain ${activeDomain}:`, error);
      return {
        content: [{ type: "text", text: `Error loading context for domain ${activeDomain}: ${error}` }],
        isError: true
      };
    }
  }
);

server.tool(
  "advancedcontext",
  {
    type: z.enum(["graph", "search", "nodes", "related", "decisions", "milestone"]),
    params: z.any().optional()
  },
  async ({ type, params }) => {
    if (!activeDomain) {
      return {
        content: [{ type: "text", text: "Error: No active domain set. Use setActiveDomain tool first." }],
        isError: true
      };
    }

    const domainClient = domainClients[activeDomain];
    
    if (!domainClient || !domainClient.connected) {
      const connected = await domainClient.connect();
      if (!connected) {
        return {
          content: [{ type: "text", text: `Error: Could not connect to domain server for '${activeDomain}'` }],
          isError: true
        };
      }
    }
    
    // Forward the advancedcontext call to the domain server
    try {
      const result = await domainClient.callTool({
        name: "advancedcontext",
        arguments: {
          type,
          params
        }
      });
      
      return result;
    } catch (error) {
      console.error(`Error performing advanced context operation for domain ${activeDomain}:`, error);
      return {
        content: [{ type: "text", text: `Error performing advanced context operation for domain ${activeDomain}: ${error}` }],
        isError: true
      };
    }
  }
);

// List all entities
server.tool(
  "listAllEntities",
  {
    random_string: z.string().optional()
  },
  async () => {
    if (!activeDomain) {
      return {
        content: [{ type: "text", text: "Error: No active domain set. Use setActiveDomain tool first." }],
        isError: true
      };
    }

    const domainClient = domainClients[activeDomain];
    
    if (!domainClient || !domainClient.connected) {
      const connected = await domainClient.connect();
      if (!connected) {
        return {
          content: [{ type: "text", text: `Error: Could not connect to domain server for '${activeDomain}'` }],
          isError: true
        };
      }
    }
    
    // Forward the listAllEntities call to the domain server
    try {
      const result = await domainClient.callTool({
        name: "listAllEntities",
        arguments: {
          random_string: `from_context_manager_${Date.now()}`
        }
      });
      
      return result;
    } catch (error) {
      // If the domain server doesn't support listAllEntities, fall back to our domain registry
      const domain = domains.find(d => d.name === activeDomain);
      if (!domain) {
        return {
          content: [{ type: "text", text: `Error: Domain '${activeDomain}' not found.` }],
          isError: true
        };
      }

      return {
        content: [{ 
          type: "text", 
          text: `Available entity types in ${activeDomain} domain: ${domain.entityTypes.join(", ")}` 
        }]
      };
    }
  }
);

// Domain discovery resources
server.resource(
  "domains",
  "domains://list",
  async (uri) => ({
    contents: [{
      uri: uri.href,
      text: JSON.stringify(domains, null, 2)
    }]
  })
);

// Cross-domain functionality
server.tool(
  "relateCrossDomain",
  {
    fromDomain: z.string(),
    fromEntity: z.string(),
    toDomain: z.string(),
    toEntity: z.string(),
    relationType: z.string()
  },
  async ({ fromDomain, fromEntity, toDomain, toEntity, relationType }) => {
    // Validate domains
    const fromDomainInfo = domains.find(d => d.name.toLowerCase() === fromDomain.toLowerCase());
    const toDomainInfo = domains.find(d => d.name.toLowerCase() === toDomain.toLowerCase());
    
    if (!fromDomainInfo) {
      return {
        content: [{ type: "text", text: `Error: Source domain '${fromDomain}' not found.` }],
        isError: true
      };
    }
    
    if (!toDomainInfo) {
      return {
        content: [{ type: "text", text: `Error: Target domain '${toDomain}' not found.` }],
        isError: true
      };
    }
    
    // Create cross-domain relation by adding observations to both entities
    try {
      // Connect to source domain
      const fromDomainClient = domainClients[fromDomainInfo.name];
      if (!fromDomainClient || !fromDomainClient.connected) {
        const connected = await fromDomainClient.connect();
        if (!connected) {
          return {
            content: [{ type: "text", text: `Error: Could not connect to domain server for '${fromDomain}'` }],
            isError: true
          };
        }
      }
      
      // Connect to target domain
      const toDomainClient = domainClients[toDomainInfo.name];
      if (!toDomainClient || !toDomainClient.connected) {
        const connected = await toDomainClient.connect();
        if (!connected) {
          return {
            content: [{ type: "text", text: `Error: Could not connect to domain server for '${toDomain}'` }],
            isError: true
          };
        }
      }
      
      // Add observation to source entity about relation to target entity
      await fromDomainClient.callTool({
        name: "buildcontext",
        arguments: {
          type: "observations",
          data: {
            observations: [
              {
                entityName: fromEntity,
                contents: [`Related to ${toEntity} (${toDomainInfo.name} domain) via ${relationType}`]
              }
            ]
          }
        }
      });
      
      // Add observation to target entity about relation from source entity
      await toDomainClient.callTool({
        name: "buildcontext",
        arguments: {
          type: "observations",
          data: {
            observations: [
              {
                entityName: toEntity,
                contents: [`Related from ${fromEntity} (${fromDomainInfo.name} domain) via ${relationType}`]
              }
            ]
          }
        }
      });
      
      return {
        content: [{ 
          type: "text", 
          text: `Created cross-domain relation: ${fromEntity} (${fromDomain}) --[${relationType}]--> ${toEntity} (${toDomain})` 
        }]
      };
    } catch (error) {
      console.error(`Error creating cross-domain relation:`, error);
      return {
        content: [{ type: "text", text: `Error creating cross-domain relation: ${error}` }],
        isError: true
      };
    }
  }
);

// Main function to start the server
async function main() {
  // Start receiving messages on stdin and sending messages on stdout
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

// Execute the main function
main().catch(error => {
  console.error("Error in contextmanager:", error);
  process.exit(1);
}); 