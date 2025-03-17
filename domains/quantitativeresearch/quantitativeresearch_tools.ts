// Tools for the Quantitative Researcher domain
// Implements model-controlled versions of the load-context and analysis functionality

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { loadSessionStates } from "./index.js";

// Define types for entities, relations, and the knowledge graph manager
interface Entity {
  name: string;
  entityType: string;
  observations: string[];
}

interface Relation {
  from: string;
  to: string;
  relationType: string;
}

interface KnowledgeGraph {
  entities: Entity[];
  relations: Relation[];
}

// Initialize knowledgeGraphManager as null initially
let knowledgeGraphManager: any = null;

// Function to lazily initialize the knowledge graph manager
async function getKnowledgeGraphManager() {
  if (!knowledgeGraphManager) {
    // Dynamically import to avoid circular reference
    try {
      const module = await import("./index.js");
      const KnowledgeGraphManager = module.KnowledgeGraphManager;
      knowledgeGraphManager = new KnowledgeGraphManager();
    } catch (err) {
      console.error("Failed to initialize KnowledgeGraphManager:", err);
    }
  }
  return knowledgeGraphManager;
}

/**
 * Process a stage of session analysis based on the current stage type
 */
async function processStage(params: {
  sessionId: string;
  stage: string;
  stageNumber: number;
  totalStages: number;
  analysis?: string;
  stageData?: any;
  nextStageNeeded: boolean;
  isRevision?: boolean;
  revisesStage?: number;
}, previousStages: any[]): Promise<any> {
  // Process based on the stage
  switch (params.stage) {
    case "summary":
      // Process summary stage
      return {
        stage: "summary",
        stageNumber: params.stageNumber,
        analysis: params.analysis || "",
        stageData: params.stageData || { 
          summary: "",
          duration: "",
          project: "",
          date: new Date().toISOString().split('T')[0]
        },
        completed: !params.nextStageNeeded
      };
      
    case "datasetUpdates":
      // Process dataset updates stage
      return {
        stage: "datasetUpdates",
        stageNumber: params.stageNumber,
        analysis: params.analysis || "",
        stageData: params.stageData || { datasets: [] },
        completed: !params.nextStageNeeded
      };
      
    case "newAnalyses":
      // Process new analyses stage
      return {
        stage: "newAnalyses",
        stageNumber: params.stageNumber,
        analysis: params.analysis || "",
        stageData: params.stageData || { analyses: [] },
        completed: !params.nextStageNeeded
      };
      
    case "newVisualizations":
      // Process visualizations stage
      return {
        stage: "newVisualizations",
        stageNumber: params.stageNumber,
        analysis: params.analysis || "",
        stageData: params.stageData || { visualizations: [] },
        completed: !params.nextStageNeeded
      };
      
    case "hypothesisResults":
      // Process hypothesis results stage
      return {
        stage: "hypothesisResults",
        stageNumber: params.stageNumber,
        analysis: params.analysis || "",
        stageData: params.stageData || { hypotheses: [] },
        completed: !params.nextStageNeeded
      };
      
    case "modelUpdates":
      // Process model updates stage
      return {
        stage: "modelUpdates",
        stageNumber: params.stageNumber,
        analysis: params.analysis || "",
        stageData: params.stageData || { models: [] },
        completed: !params.nextStageNeeded
      };
      
    case "projectStatus":
      // Process project status stage
      return {
        stage: "projectStatus",
        stageNumber: params.stageNumber,
        analysis: params.analysis || "",
        stageData: params.stageData || { 
          projectStatus: "",
          projectObservation: ""
        },
        completed: !params.nextStageNeeded
      };
      
    case "assembly":
      // Final assembly stage - compile all arguments for end-session
      return {
        stage: "assembly",
        stageNumber: params.stageNumber,
        analysis: "Final assembly of end-session arguments",
        stageData: assembleEndSessionArgs(previousStages),
        completed: true
      };
      
    default:
      throw new Error(`Unknown stage: ${params.stage}`);
  }
}

/**
 * Assemble the final end-session arguments from all processed stages
 */
function assembleEndSessionArgs(stages: any[]): any {
  const summaryStage = stages.find(s => s.stage === "summary");
  const datasetUpdatesStage = stages.find(s => s.stage === "datasetUpdates");
  const newAnalysesStage = stages.find(s => s.stage === "newAnalyses");
  const newVisualizationsStage = stages.find(s => s.stage === "newVisualizations");
  const hypothesisResultsStage = stages.find(s => s.stage === "hypothesisResults");
  const modelUpdatesStage = stages.find(s => s.stage === "modelUpdates");
  const projectStatusStage = stages.find(s => s.stage === "projectStatus");
  
  // Get current date if not already set
  const date = summaryStage?.stageData?.date || new Date().toISOString().split('T')[0];
  
  return {
    date,
    summary: summaryStage?.stageData?.summary || "",
    duration: summaryStage?.stageData?.duration || "unknown",
    project: summaryStage?.stageData?.project || "",
    datasetUpdates: JSON.stringify(datasetUpdatesStage?.stageData?.datasets || []),
    newAnalyses: JSON.stringify(newAnalysesStage?.stageData?.analyses || []),
    newVisualizations: JSON.stringify(newVisualizationsStage?.stageData?.visualizations || []),
    hypothesisResults: JSON.stringify(hypothesisResultsStage?.stageData?.hypotheses || []),
    modelUpdates: JSON.stringify(modelUpdatesStage?.stageData?.models || []),
    projectStatus: projectStatusStage?.stageData?.projectStatus || "",
    projectObservation: projectStatusStage?.stageData?.projectObservation || ""
  };
}

/**
 * Register the tools with the MCP server
 */
export function registerQuantitativeResearcherTools(server: McpServer): void {
  // Initialize the knowledge graph manager
  getKnowledgeGraphManager().catch(err => {
    console.error("Failed to initialize KnowledgeGraphManager:", err);
  });
  
  // Define the loadcontext tool - model-controlled version of load-context prompt
  server.tool(
    "loadcontext",
    {
      entityName: z.string().describe("Name of the entity to load context for"),
      entityType: z.string().optional().describe("Type of entity to load (project, dataset, variable, etc.), defaults to 'project'"),
      sessionId: z.string().optional().describe("Session ID from startsession to track context loading")
    },
    async ({ entityName, entityType = "project", sessionId }: { entityName: string; entityType?: string; sessionId?: string }) => {
      try {
        // Ensure knowledgeGraphManager is initialized
        const manager = await getKnowledgeGraphManager();
        
        // If sessionId is provided, load session state
        if (sessionId) {
          const sessionStates = await loadSessionStates();
          const sessionState = sessionStates.get(sessionId);
        }
        
        // Get the entity
        const entityGraph = await manager.searchNodes(entityName);
        if (entityGraph.entities.length === 0) {
          throw new Error(`Entity ${entityName} not found`);
        }
        
        // Find the exact entity by name (case-sensitive match)
        const entity = entityGraph.entities.find((e: Entity) => e.name === entityName);
        if (!entity) {
          throw new Error(`Entity ${entityName} not found`);
        }
        
        // Different context loading based on entity type
        let contextMessage = "";
        
        if (entityType === "project") {
          // Get project overview
          const projectOverview = await manager.getProjectOverview(entityName);
          
          // Get hypothesis tests
          let hypothesisTests;
          try {
            hypothesisTests = await manager.getHypothesisTests(entityName);
          } catch (error) {
            hypothesisTests = { hypotheses: [] };
          }
          
          // Get statistical results
          let statisticalResults;
          try {
            statisticalResults = await manager.getStatisticalResults(entityName);
          } catch (error) {
            statisticalResults = { tests: [] };
          }
          
          // Get visualization gallery
          let visualizations;
          try {
            visualizations = await manager.getVisualizationGallery(entityName);
          } catch (error) {
            visualizations = { visualizations: [] };
          }
          
          // Find datasets for this project
          const datasetsRelations = entityGraph.relations.filter((r: Relation) => 
            r.from === entityName && 
            r.relationType === "contains"
          );
          
          const datasetsGraph = await manager.searchNodes("entityType:dataset");
          const relatedDatasets = datasetsGraph.entities.filter((d: Entity) => 
            datasetsRelations.some((r: Relation) => r.to === d.name)
          );
          
          // Find models for this project
          const modelsGraph = await manager.searchNodes("entityType:model");
          const relatedModels = modelsGraph.entities.filter((m: Entity) => 
            datasetsRelations.some((r: Relation) => r.to === m.name)
          );
          
          // Format project context message
          const status = entity.observations.find((o: string) => o.startsWith("status:"))?.substring(7) || "Unknown";
          const updated = entity.observations.find((o: string) => o.startsWith("updated:"))?.substring(8) || "Unknown";
          const description = entity.observations.find((o: string) => !o.startsWith("status:") && !o.startsWith("updated:"));
          
          // Format datasets info
          const datasetsText = relatedDatasets.map((d: Entity) => {
            const size = d.observations.find((o: string) => o.startsWith("size:"))?.substring(5) || "Unknown size";
            const variables = d.observations.find((o: string) => o.startsWith("variables:"))?.substring(10) || "Unknown variables";
            return `- **${d.name}**: ${size}, ${variables} variables`;
          }).join("\n");
          
          // Format hypotheses
          const hypothesesText = hypothesisTests.hypotheses?.map((h: any) => {
            return `- **${h.name}**: ${h.status} (p-value: ${h.pValue || "N/A"})${h.conclusion ? ` - ${h.conclusion}` : ""}`;
          }).join("\n") || "No hypotheses found";
          
          // Format statistical tests
          const testsText = statisticalResults.tests?.map((t: any) => {
            return `- **${t.name}** (${t.type}): ${t.result || "No result"} - Variables: ${t.variables?.join(", ") || "N/A"}`;
          }).join("\n") || "No statistical tests found";
          
          // Format models
          const modelsText = relatedModels.map((m: Entity) => {
            const type = m.observations.find((o: string) => o.startsWith("type:"))?.substring(5) || "Unknown type";
            const performance = m.observations.find((o: string) => o.startsWith("performance:"))?.substring(12) || "No metrics";
            return `- **${m.name}** (${type}): ${performance}`;
          }).join("\n");
          
          // Format visualizations
          const visualizationsText = visualizations.visualizations?.slice(0, 5).map((v: any) => {
            return `- **${v.name}** (${v.type}): ${v.description || "No description"}`;
          }).join("\n") || "No visualizations found";
          
          contextMessage = `# Quantitative Research Project Context: ${entityName}

## Project Overview
- **Status**: ${status}
- **Last Updated**: ${updated}
- **Description**: ${description || "No description"}

## Datasets
${datasetsText || "No datasets associated with this project"}

## Hypotheses
${hypothesesText}

## Statistical Tests
${testsText}

## Models
${modelsText || "No models associated with this project"}

## Key Visualizations
${visualizationsText}`;
        } 
        else if (entityType === "dataset") {
          // Get dataset analysis
          let datasetAnalysis;
          try {
            datasetAnalysis = await manager.getDatasetAnalysis(entityName);
          } catch (error) {
            datasetAnalysis = { variables: [], descriptiveStats: {} };
          }
          
          // Find which project this dataset belongs to
          const projectRel = entityGraph.relations.find((r: Relation) => r.to === entityName && r.relationType === "contains");
          const projectName = projectRel ? projectRel.from : "Unknown project";
          
          // Get visualizations for this dataset
          let visualizations;
          try {
            visualizations = await manager.getVisualizationGallery(projectName, entityName);
          } catch (error) {
            visualizations = { visualizations: [] };
          }
          
          // Get models trained on this dataset
          const modelsGraph = await manager.searchNodes("entityType:model");
          const trainedModels = modelsGraph.entities.filter((m: Entity) => {
            return modelsGraph.relations.some((r: Relation) => 
              r.from === m.name && 
              r.to === entityName && 
              r.relationType === "trained_on"
            );
          });
          
          // Format dataset context
          const size = entity.observations.find((o: string) => o.startsWith("size:"))?.substring(5) || "Unknown";
          const variablesCount = entity.observations.find((o: string) => o.startsWith("variables:"))?.substring(10) || "Unknown";
          const description = entity.observations.find((o: string) => !o.startsWith("size:") && !o.startsWith("variables:") && !o.startsWith("status:") && !o.startsWith("created:") && !o.startsWith("updated:"));
          
          // Format variables
          const variablesText = datasetAnalysis.variables?.map((v: any) => {
            const dataType = v.metadata?.dataType || "Unknown";
            const scale = v.metadata?.scale || "Unknown";
            const stats = v.distribution?.descriptiveStats || {};
            const statsText = Object.entries(stats)
              .map(([key, value]) => `${key}: ${value}`)
              .join(", ");
            return `- **${v.variable.name}** (${dataType}, ${scale}): ${statsText || "No statistics available"}`;
          }).join("\n") || "No variables found";
          
          // Format models
          const modelsText = trainedModels.map((m: Entity) => {
            const type = m.observations.find((o: string) => o.startsWith("type:"))?.substring(5) || "Unknown type";
            const performance = m.observations.find((o: string) => o.startsWith("performance:"))?.substring(12) || "No metrics";
            return `- **${m.name}** (${type}): ${performance}`;
          }).join("\n");
          
          // Format visualizations
          const visualizationsText = visualizations.visualizations?.slice(0, 5).map((v: any) => {
            return `- **${v.name}** (${v.type}): ${v.description || "No description"}`;
          }).join("\n") || "No visualizations found";
          
          contextMessage = `# Dataset Context: ${entityName}

## Dataset Overview
- **Project**: ${projectName}
- **Size**: ${size}
- **Variables**: ${variablesCount}
- **Description**: ${description || "No description"}

## Variables
${variablesText}

## Visualizations
${visualizationsText}

## Models Trained on this Dataset
${modelsText || "No models have been trained on this dataset"}`;
        }
        else if (entityType === "variable") {
          // Get variable distribution
          let variableDistribution;
          try {
            // First find which dataset this variable belongs to
            const datasetRel = entityGraph.relations.find((r: Relation) => r.to === entityName && r.relationType === "contains");
            const datasetName = datasetRel ? datasetRel.from : undefined;
            
            if (datasetName) {
              variableDistribution = await manager.getVariableDistribution(entityName, datasetName);
            } else {
              variableDistribution = await manager.getVariableDistribution(entityName, "unknown");
            }
          } catch (error) {
            variableDistribution = { stats: {}, normality: "Unknown", histogram: "N/A" };
          }
          
          // Get variable relationships
          let relationships;
          try {
            relationships = await manager.getVariableRelationships(entityName);
          } catch (error) {
            relationships = { correlations: [], dependencies: [] };
          }
          
          // Format variable context
          const dataType = entity.observations.find((o: string) => o.startsWith("Type:"))?.substring(5) || "Unknown type";
          const role = entity.observations.find((o: string) => o.startsWith("Role:"))?.substring(5) || "Unknown role";
          const scale = entity.observations.find((o: string) => o.startsWith("Scale:"))?.substring(6) || "Unknown scale";
          const description = entity.observations.find((o: string) => !o.startsWith("Type:") && !o.startsWith("Role:") && !o.startsWith("Scale:"));
          
          // Format stats
          const statsText = Object.entries(variableDistribution.stats || {})
            .map(([key, value]) => `- **${key}**: ${value}`)
            .join("\n");
          
          // Format correlations
          const correlationsText = relationships.correlations?.map((c: any) => {
            return `- **${c.variable}**: ${c.coefficient} (p-value: ${c.pValue || "N/A"}) - ${c.strength || "Unknown"} ${c.direction || ""}`;
          }).join("\n") || "No correlations found";
          
          contextMessage = `# Variable Context: ${entityName}

## Variable Details
- **Data Type**: ${dataType}
- **Role**: ${role}
- **Scale**: ${scale}
- **Description**: ${description || "No description"}

## Descriptive Statistics
${statsText || "No statistics available"}

## Normality
${variableDistribution.normality || "Not tested"}

## Correlations with Other Variables
${correlationsText}`;
        }
        else if (entityType === "model") {
          // Get model performance
          let modelPerformance;
          try {
            modelPerformance = await manager.getModelPerformance(entityName);
          } catch (error) {
            modelPerformance = { metrics: {}, details: {}, confusionMatrix: null };
          }
          
          // Find which dataset this model was trained on
          const datasetRel = entityGraph.relations.find((r: Relation) => r.from === entityName && r.relationType === "trained_on");
          const datasetName = datasetRel ? datasetRel.to : "Unknown dataset";
          
          // Format model context
          const type = entity.observations.find((o: string) => o.startsWith("type:"))?.substring(5) || "Unknown type";
          const created = entity.observations.find((o: string) => o.startsWith("created:"))?.substring(8) || "Unknown";
          const updated = entity.observations.find((o: string) => o.startsWith("updated:"))?.substring(8) || "Unknown";
          const notes = entity.observations.find((o: string) => !o.startsWith("type:") && !o.startsWith("performance:") && !o.startsWith("created:") && !o.startsWith("updated:"));
          
          // Format metrics
          const metricsText = Object.entries(modelPerformance.metrics || {})
            .map(([key, value]) => `- **${key}**: ${value}`)
            .join("\n");
          
          // Format model parameters and hyperparameters
          const paramsText = Object.entries(modelPerformance.details?.parameters || {})
            .map(([key, value]) => `- **${key}**: ${value}`)
            .join("\n");
          
          contextMessage = `# Model Context: ${entityName}

## Model Overview
- **Type**: ${type}
- **Trained on**: ${datasetName}
- **Created**: ${created}
- **Last Updated**: ${updated}
- **Notes**: ${notes || "No notes"}

## Performance Metrics
${metricsText || "No metrics available"}

## Parameters
${paramsText || "No parameters available"}`;
        }
        else if (entityType === "hypothesis") {
          // Get related statistical tests
          const testsGraph = await manager.searchNodes("entityType:statistical_test");
          const relatedTests = testsGraph.entities.filter((t: Entity) => {
            return testsGraph.relations.some((r: Relation) => 
              r.from === entityName && 
              r.to === t.name && 
              r.relationType === "tested_by"
            );
          });
          
          // Format hypothesis context
          const status = entity.observations.find((o: string) => o.startsWith("status:"))?.substring(7) || "Unknown";
          const pValue = entity.observations.find((o: string) => o.startsWith("p-value:"))?.substring(8) || "N/A";
          const created = entity.observations.find((o: string) => o.startsWith("created:"))?.substring(8) || "Unknown";
          const updated = entity.observations.find((o: string) => o.startsWith("updated:"))?.substring(8) || "Unknown";
          const projectObs = entity.observations.find((o: string) => o.startsWith("project:"))?.substring(8);
          const notes = entity.observations.find((o: string) => 
            !o.startsWith("status:") && 
            !o.startsWith("p-value:") && 
            !o.startsWith("created:") && 
            !o.startsWith("updated:") && 
            !o.startsWith("project:")
          );
          
          // Format tests
          const testsText = relatedTests.map((t: Entity) => {
            const type = t.observations.find((o: string) => o.startsWith("type:"))?.substring(5) || "Unknown type";
            const result = t.observations.find((o: string) => o.startsWith("result:"))?.substring(7) || "No result";
            return `- **${t.name}** (${type}): ${result}`;
          }).join("\n");
          
          contextMessage = `# Hypothesis Context: ${entityName}

## Hypothesis Details
- **Status**: ${status}
- **P-value**: ${pValue}
- **Created**: ${created}
- **Last Updated**: ${updated}
- **Project**: ${projectObs || "Not associated with a specific project"}
- **Notes**: ${notes || "No notes"}

## Statistical Tests
${testsText || "No statistical tests associated with this hypothesis"}`;
        }
        else if (entityType === "statistical_test") {
          // Format test context
          const type = entity.observations.find((o: string) => o.startsWith("type:"))?.substring(5) || "Unknown type";
          const result = entity.observations.find((o: string) => o.startsWith("result:"))?.substring(7) || "No result";
          const pValue = entity.observations.find((o: string) => o.startsWith("p-value:"))?.substring(8) || "N/A";
          const date = entity.observations.find((o: string) => o.startsWith("date:"))?.substring(5) || "Unknown";
          const projectObs = entity.observations.find((o: string) => o.startsWith("project:"))?.substring(8);
          
          // Get variables analyzed by this test
          const variablesGraph = await manager.searchNodes("entityType:variable");
          const analyzedVariables = variablesGraph.entities.filter((v: Entity) => {
            return entityGraph.relations.some((r: Relation) => 
              r.from === entityName && 
              r.to === v.name && 
              r.relationType === "analyzes"
            );
          });
          
          // Get hypotheses tested by this test
          const hypothesesGraph = await manager.searchNodes("entityType:hypothesis");
          const relatedHypotheses = hypothesesGraph.entities.filter((h: Entity) => {
            return hypothesesGraph.relations.some((r: Relation) => 
              r.from === h.name && 
              r.to === entityName && 
              r.relationType === "tested_by"
            );
          });
          
          // Format variables
          const variablesText = analyzedVariables.map((v: Entity) => {
            const dataType = v.observations.find((o: string) => o.startsWith("Type:"))?.substring(5) || "Unknown type";
            const scale = v.observations.find((o: string) => o.startsWith("Scale:"))?.substring(6) || "Unknown scale";
            return `- **${v.name}** (${dataType}, ${scale})`;
          }).join("\n");
          
          // Format hypotheses
          const hypothesesText = relatedHypotheses.map((h: Entity) => {
            const status = h.observations.find((o: string) => o.startsWith("status:"))?.substring(7) || "Unknown";
            return `- **${h.name}**: ${status}`;
          }).join("\n");
          
          contextMessage = `# Statistical Test Context: ${entityName}

## Test Details
- **Type**: ${type}
- **Result**: ${result}
- **P-value**: ${pValue}
- **Date**: ${date}
- **Project**: ${projectObs || "Not associated with a specific project"}

## Variables Analyzed
${variablesText || "No variables explicitly associated with this test"}

## Hypotheses Tested
${hypothesesText || "No hypotheses explicitly linked to this test"}`;
        }
        else {
          // Generic entity context
          const observations = entity.observations.join("\n- ");
          
          contextMessage = `# Entity Context: ${entityName}

## Entity Type
${entity.entityType}

## Observations
- ${observations}`;
        }
        
        return {
          content: [{
            type: "text",
            text: contextMessage
          }]
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: JSON.stringify({ 
              success: false,
              error: error instanceof Error ? error.message : String(error)
            }, null, 2)
          }]
        };
      }
    }
  );
} 