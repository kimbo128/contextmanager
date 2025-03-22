#!/usr/bin/env node

// Updated imports using the modern MCP SDK API
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// Node.js type declarations
import { promises as fs } from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { readFileSync, existsSync } from "fs";
// Environment variable for memory file path with fallback
const MEMORY_FILE_PATH = process.env.MEMORY_FILE_PATH || path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'project_memory.json'
);

// Define sessions file path in the same directory as memory file
const SESSIONS_FILE_PATH = process.env.SESSIONS_FILE_PATH || 
  path.join(path.dirname(MEMORY_FILE_PATH), 'project_sessions.json');

// Project management specific entity types
const validEntityTypes = [
  'project',      // The main container for all related entities
  'task',         // Individual work items that need to be completed
  'milestone',    // Key checkpoints or deliverables in the project
  'resource',     // Materials, tools, or assets needed for the project
  'teamMember',   // People involved in the project
  'note',         // Documentation, ideas, or observations
  'document',     // Formal project documents
  'issue',        // Problems or blockers
  'risk',         // Potential future problems
  'decision',     // Important choices made during the project
  'dependency',   // External requirements or prerequisites
  'component',    // Parts or modules of the project
  'stakeholder',  // People affected by or interested in the project
  'change'        // Modifications to project scope or requirements
] as const;

// Type for entity types to ensure type safety
type EntityType = typeof validEntityTypes[number];

// Validation functions
function isValidEntityType(type: string): type is EntityType {
  return validEntityTypes.includes(type as any);
}

function validateEntityType(type: string): void {
  if (!isValidEntityType(type)) {
    throw new Error(`Invalid entity type: ${type}. Valid types are: ${validEntityTypes.join(', ')}`);
  }
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Collect tool descriptions from text files
const toolDescriptions: Record<string, string> = {
  'startsession': '',
  'loadcontext': '',
  'deletecontext': '',
  'buildcontext': '',
  'advancedcontext': '',
  'endsession': '',
};
for (const tool of Object.keys(toolDescriptions)) {
  const descriptionFilePath = path.resolve(
    __dirname,
    `project_${tool}.txt`
  );
  if (existsSync(descriptionFilePath)) {
    toolDescriptions[tool] = readFileSync(descriptionFilePath, 'utf-8');
  }
}

// Session management functions
async function loadSessionStates(): Promise<Map<string, any[]>> {
  try {
    const fileContent = await fs.readFile(SESSIONS_FILE_PATH, 'utf-8');
    const sessions = JSON.parse(fileContent);
    // Convert from object to Map
    const sessionsMap = new Map<string, any[]>();
    for (const [key, value] of Object.entries(sessions)) {
      sessionsMap.set(key, value as any[]);
    }
    return sessionsMap;
  } catch (error) {
    if (error instanceof Error && 'code' in error && (error as any).code === "ENOENT") {
      return new Map<string, any[]>();
    }
    throw error;
  }
}

async function saveSessionStates(sessionsMap: Map<string, any[]>): Promise<void> {
  // Convert from Map to object
  const sessions: Record<string, any[]> = {};
  for (const [key, value] of sessionsMap.entries()) {
    sessions[key] = value;
  }
  await fs.writeFile(SESSIONS_FILE_PATH, JSON.stringify(sessions, null, 2), 'utf-8');
}

// Generate a unique session ID
function generateSessionId(): string {
  return `proj_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
}

// Define common relation types for project entities
const VALID_RELATION_TYPES = [
  'part_of',          // Indicates an entity is a component/subset of another
  'depends_on',       // Shows dependencies between entities
  'assigned_to',      // Links tasks to team members
  'created_by',       // Tracks who created an entity
  'modified_by',      // Records who changed an entity
  'related_to',       // Shows general connections between entities
  'blocks',           // Indicates one entity is blocking another
  'manages',          // Shows management relationships
  'contributes_to',   // Shows contributions to entities
  'documents',        // Links documentation to entities
  'scheduled_for',    // Connects entities to dates or timeframes
  'responsible_for',  // Assigns ownership/responsibility
  'reports_to',       // Indicates reporting relationships
  'categorized_as',   // Links entities to categories or types
  'required_for',     // Shows requirements for completion
  'discovered_in',    // Links issues to their discovery context
  'resolved_by',      // Shows what resolved an issue
  'impacted_by',      // Shows impact relationships
  'stakeholder_of',   // Links stakeholders to projects/components
  'prioritized_as'    // Indicates priority levels
];

// Status values for different entity types
const STATUS_VALUES = {
  project: ['planning', 'in_progress', 'on_hold', 'completed', 'cancelled', 'archived'],
  task: ['not_started', 'in_progress', 'blocked', 'under_review', 'completed', 'cancelled'],
  milestone: ['planned', 'approaching', 'reached', 'missed', 'rescheduled'],
  issue: ['identified', 'analyzing', 'fixing', 'testing', 'resolved', 'wont_fix'],
  risk: ['identified', 'monitoring', 'mitigating', 'occurred', 'avoided', 'accepted'],
  decision: ['proposed', 'under_review', 'approved', 'rejected', 'implemented', 'reversed']
};

// We are storing our memory using entities, relations, and observations in a graph structure
interface Entity {
  name: string;
  entityType: EntityType;
  observations: string[];
  embedding?: Embedding;
}

interface Relation {
  from: string;
  to: string;
  relationType: string;
  observations?: string[];
}

interface KnowledgeGraph {
  entities: Entity[];
  relations: Relation[];
}

// Add the Embedding type definition near the top of the file
type Embedding = number[];

class KnowledgeGraphManager {
  public async loadGraph(): Promise<KnowledgeGraph> {
    try {
      const fileContent = await fs.readFile(MEMORY_FILE_PATH, 'utf-8');
      return JSON.parse(fileContent);
    } catch (error) {
      // If file doesn't exist or is invalid, return an empty graph
      return { entities: [], relations: [] };
    }
  }

  private async saveGraph(graph: KnowledgeGraph): Promise<void> {
    await fs.writeFile(MEMORY_FILE_PATH, JSON.stringify(graph, null, 2), 'utf-8');
  }

  async createEntities(entities: Entity[]): Promise<KnowledgeGraph> {
    const graph = await this.loadGraph();
    
    // Validate entity names don't already exist
    for (const entity of entities) {
      if (graph.entities.some(e => e.name === entity.name)) {
        throw new Error(`Entity with name ${entity.name} already exists`);
      }
      validateEntityType(entity.entityType);
    }
    
    // Add new entities
    graph.entities.push(...entities);
    
    // Save updated graph
    await this.saveGraph(graph);
    return graph;
  }

  async createRelations(relations: Relation[]): Promise<KnowledgeGraph> {
    const graph = await this.loadGraph();
    
    // Validate relations
    for (const relation of relations) {
      // Check if entities exist
      if (!graph.entities.some(e => e.name === relation.from)) {
        throw new Error(`Entity '${relation.from}' not found`);
      }
      if (!graph.entities.some(e => e.name === relation.to)) {
        throw new Error(`Entity '${relation.to}' not found`);
      }
      if (!VALID_RELATION_TYPES.includes(relation.relationType)) {
        throw new Error(`Invalid relation type: ${relation.relationType}. Valid types are: ${VALID_RELATION_TYPES.join(', ')}`);
      }
      
      // Check if relation already exists
      if (graph.relations.some(r => 
        r.from === relation.from && 
        r.to === relation.to && 
        r.relationType === relation.relationType
      )) {
        throw new Error(`Relation from '${relation.from}' to '${relation.to}' with type '${relation.relationType}' already exists`);
      }
    }
    
    // Add relations
    graph.relations.push(...relations);
    
    // Save updated graph
    await this.saveGraph(graph);
    return graph;
  }

  async addObservations(entityName: string, observations: string[]): Promise<KnowledgeGraph> {
    const graph = await this.loadGraph();
    
    // Find the entity
    const entity = graph.entities.find(e => e.name === entityName);
    if (!entity) {
      throw new Error(`Entity '${entityName}' not found`);
    }
    
    // Add observations
    entity.observations.push(...observations);
    
    // Save updated graph
    await this.saveGraph(graph);
    return graph;
  }

  async deleteEntities(entityNames: string[]): Promise<void> {
    const graph = await this.loadGraph();
    
    // Remove the entities
    graph.entities = graph.entities.filter(e => !entityNames.includes(e.name));
    
    // Remove any relations that involve those entities
    graph.relations = graph.relations.filter(
      r => !entityNames.includes(r.from) && !entityNames.includes(r.to)
    );
    
    await this.saveGraph(graph);
  }

  async deleteObservations(deletions: { entityName: string; observations: string[] }[]): Promise<void> {
    const graph = await this.loadGraph();
    
    for (const deletion of deletions) {
      const entity = graph.entities.find(e => e.name === deletion.entityName);
      if (entity) {
        entity.observations = entity.observations.filter(
          o => !deletion.observations.includes(o)
        );
      }
    }
    
    await this.saveGraph(graph);
  }

  async deleteRelations(relations: Relation[]): Promise<void> {
    const graph = await this.loadGraph();
    
    // Remove matching relations
    graph.relations = graph.relations.filter(r => 
      !relations.some(
        rel => r.from === rel.from && r.to === rel.to && r.relationType === rel.relationType
      )
    );
    
    await this.saveGraph(graph);
  }

  async readGraph(): Promise<KnowledgeGraph> {
    return await this.loadGraph();
  }

  async searchNodes(query: string): Promise<KnowledgeGraph> {
    const graph = await this.loadGraph();
    const lowerQuery = query.toLowerCase();
    
    // Simple implementation: search entity names, types, and observations
    const matchingEntities = graph.entities.filter(entity => 
      entity.name.toLowerCase().includes(lowerQuery) ||
      entity.entityType.toLowerCase().includes(lowerQuery) ||
      entity.observations.some(o => o.toLowerCase().includes(lowerQuery))
    );
    
    // Get entity names for filtering relations
    const matchingEntityNames = new Set(matchingEntities.map(e => e.name));
    
    // Find relations between matching entities
    const matchingRelations = graph.relations.filter(relation =>
      matchingEntityNames.has(relation.from) && matchingEntityNames.has(relation.to)
    );
    
    // Also include relations where the relation type matches the query
    const additionalRelations = graph.relations.filter(relation =>
      relation.relationType.toLowerCase().includes(lowerQuery) ||
      (relation.observations && relation.observations.some(o => o.toLowerCase().includes(lowerQuery)))
    );
    
    // Merge relations without duplicates
    const allRelations = [...matchingRelations];
    for (const relation of additionalRelations) {
      if (!allRelations.some(r => 
        r.from === relation.from && 
        r.to === relation.to && 
        r.relationType === relation.relationType
      )) {
        allRelations.push(relation);
        
        // Add the entities involved in these additional relations
        if (!matchingEntityNames.has(relation.from)) {
          const fromEntity = graph.entities.find(e => e.name === relation.from);
          if (fromEntity) {
            matchingEntities.push(fromEntity);
            matchingEntityNames.add(relation.from);
          }
        }
        
        if (!matchingEntityNames.has(relation.to)) {
          const toEntity = graph.entities.find(e => e.name === relation.to);
          if (toEntity) {
            matchingEntities.push(toEntity);
            matchingEntityNames.add(relation.to);
          }
        }
      }
    }
    
    return {
      entities: matchingEntities,
      relations: allRelations
    };
  }

  async openNodes(names: string[]): Promise<KnowledgeGraph> {
    const graph = await this.loadGraph();
    
    // Find the specified entities
    const entities = graph.entities.filter(e => names.includes(e.name));
    
    // Find relations between the specified entities
    const relations = graph.relations.filter(r => 
      names.includes(r.from) && names.includes(r.to)
    );
    
    return {
      entities,
      relations
    };
  }

  // Provides a comprehensive view of a project including tasks, milestones, team members, issues, etc.
  async getProjectOverview(projectName: string): Promise<any> {
    const graph = await this.loadGraph();
    
    // Find the project
    const project = graph.entities.find(e => e.name === projectName && e.entityType === 'project');
    if (!project) {
      throw new Error(`Project '${projectName}' not found`);
    }
    
    // Extract project info from observations
    const description = project.observations.find(o => o.startsWith('Description:'))?.split(':', 2)[1]?.trim();
    const startDate = project.observations.find(o => o.startsWith('StartDate:'))?.split(':', 2)[1]?.trim();
    const endDate = project.observations.find(o => o.startsWith('EndDate:'))?.split(':', 2)[1]?.trim();
    const priority = project.observations.find(o => o.startsWith('Priority:'))?.split(':', 2)[1]?.trim();
    const status = project.observations.find(o => o.startsWith('Status:'))?.split(':', 2)[1]?.trim() || 'planning';
    const goal = project.observations.find(o => o.startsWith('Goal:'))?.split(':', 2)[1]?.trim();
    const budget = project.observations.find(o => o.startsWith('Budget:'))?.split(':', 2)[1]?.trim();
    
    // Find components of the project
    const components = graph.entities.filter(e => {
      return graph.relations.some(r => 
        r.from === e.name && 
        r.to === projectName && 
        r.relationType === 'part_of' &&
        e.entityType === 'component'
      );
    });
    
    // Find tasks for this project
    const tasks: Entity[] = [];
    for (const relation of graph.relations) {
      if (relation.relationType === 'part_of' && relation.to === projectName) {
        const task = graph.entities.find(e => e.name === relation.from && e.entityType === 'task');
        if (task) {
          tasks.push(task);
        }
      }
    }
    
    // Group tasks by status
    const tasksByStatus: { [status: string]: Entity[] } = {};
    for (const task of tasks) {
      const taskStatus = task.observations.find(o => o.startsWith('Status:'))?.split(':', 2)[1]?.trim() || 'not_started';
      if (!tasksByStatus[taskStatus]) {
        tasksByStatus[taskStatus] = [];
      }
      tasksByStatus[taskStatus].push(task);
    }
    
    // Find milestones for this project
    const milestones: Entity[] = [];
    for (const relation of graph.relations) {
      if (relation.relationType === 'part_of' && relation.to === projectName) {
        const milestone = graph.entities.find(e => e.name === relation.from && e.entityType === 'milestone');
        if (milestone) {
          milestones.push(milestone);
        }
      }
    }
    
    // Sort milestones by date
    milestones.sort((a, b) => {
      const aDate = a.observations.find(o => o.startsWith('Date:'))?.split(':', 2)[1]?.trim() || '';
      const bDate = b.observations.find(o => o.startsWith('Date:'))?.split(':', 2)[1]?.trim() || '';
      return new Date(aDate).getTime() - new Date(bDate).getTime();
    });
    
    // Find team members for this project
    const teamMembers: Entity[] = [];
    for (const relation of graph.relations) {
      if ((relation.relationType === 'assigned_to' || relation.relationType === 'manages' || relation.relationType === 'contributes_to') && 
          relation.to === projectName) {
        const teamMember = graph.entities.find(e => e.name === relation.from && e.entityType === 'teamMember');
        if (teamMember && !teamMembers.some(tm => tm.name === teamMember.name)) {
          teamMembers.push(teamMember);
        }
      }
    }
    
    // Find issues for this project
    const issues: Entity[] = [];
    for (const relation of graph.relations) {
      if (relation.relationType === 'part_of' && relation.to === projectName) {
        const issue = graph.entities.find(e => e.name === relation.from && e.entityType === 'issue');
        if (issue) {
          issues.push(issue);
        }
      }
    }
    
    // Group issues by status
    const issuesByStatus: { [status: string]: Entity[] } = {};
    for (const issue of issues) {
      const issueStatus = issue.observations.find(o => o.startsWith('Status:'))?.split(':', 2)[1]?.trim() || 'identified';
      if (!issuesByStatus[issueStatus]) {
        issuesByStatus[issueStatus] = [];
      }
      issuesByStatus[issueStatus].push(issue);
    }
    
    // Find risks for this project
    const risks: Entity[] = [];
    for (const relation of graph.relations) {
      if (relation.relationType === 'part_of' && relation.to === projectName) {
        const risk = graph.entities.find(e => e.name === relation.from && e.entityType === 'risk');
        if (risk) {
          risks.push(risk);
        }
      }
    }
    
    // Find resources for this project
    const resources: Entity[] = [];
    for (const relation of graph.relations) {
      if (relation.relationType === 'part_of' && relation.to === projectName) {
        const resource = graph.entities.find(e => e.name === relation.from && e.entityType === 'resource');
        if (resource) {
          resources.push(resource);
        }
      }
    }
    
    // Find stakeholders for this project
    const stakeholders: Entity[] = [];
    for (const relation of graph.relations) {
      if (relation.relationType === 'stakeholder_of' && relation.to === projectName) {
        const stakeholder = graph.entities.find(e => e.name === relation.from && e.entityType === 'stakeholder');
        if (stakeholder) {
          stakeholders.push(stakeholder);
        }
      }
    }
    
    // Calculate task completion rate
    const completedTasks = tasks.filter(t => 
      t.observations.find(o => o.startsWith('Status:'))?.split(':', 2)[1]?.trim() === 'completed'
    ).length;
    const taskCompletionRate = tasks.length > 0 ? (completedTasks / tasks.length) * 100 : 0;
    
    // Get upcoming milestones
    const today = new Date();
    const upcomingMilestones = milestones.filter(m => {
      const dateStr = m.observations.find(o => o.startsWith('Date:'))?.split(':', 2)[1]?.trim();
      if (dateStr) {
        const milestoneDate = new Date(dateStr);
        return milestoneDate >= today;
      }
      return false;
    });
    
    return {
      project,
      info: {
        description,
        startDate,
        endDate,
        priority,
        status,
        goal,
        budget
      },
      summary: {
        taskCount: tasks.length,
        completedTasks,
        taskCompletionRate: Math.round(taskCompletionRate),
        milestoneCount: milestones.length,
        teamMemberCount: teamMembers.length,
        issueCount: issues.length,
        riskCount: risks.length,
        componentCount: components.length
      },
      components,
      tasks,
      tasksByStatus,
      milestones,
      upcomingMilestones,
      teamMembers,
      issues,
      issuesByStatus,
      risks,
      resources,
      stakeholders
    };
  }

  // Visualizes dependencies between tasks, optionally to a specified depth
  async getTaskDependencies(taskName: string, depth: number = 2): Promise<any> {
    const graph = await this.loadGraph();
    
    // Find the task
    const task = graph.entities.find(e => e.name === taskName && e.entityType === 'task');
    if (!task) {
      throw new Error(`Task '${taskName}' not found`);
    }
    
    // Find the project this task belongs to
    let projectName: string | undefined;
    for (const relation of graph.relations) {
      if (relation.relationType === 'part_of' && relation.from === taskName) {
        const project = graph.entities.find(e => e.name === relation.to && e.entityType === 'project');
        if (project) {
          projectName = project.name;
          break;
        }
      }
    }
    
    // Initialize dependency tree
    interface DependencyNode {
      task: Entity;
      dependsOn: DependencyNode[];
      dependedOnBy: DependencyNode[];
      level: number;
    }
    
    const dependencyMap = new Map<string, DependencyNode>();
    
    // Helper function to add a task and its dependencies recursively
    const addDependencies = (taskEntity: Entity, currentLevel: number, direction: 'dependsOn' | 'dependedOnBy') => {
      if (currentLevel > depth) return;
      
      // Create node if it doesn't exist
      if (!dependencyMap.has(taskEntity.name)) {
        dependencyMap.set(taskEntity.name, {
          task: taskEntity,
          dependsOn: [],
          dependedOnBy: [],
          level: direction === 'dependsOn' ? currentLevel : 0
        });
      }
      
      const node = dependencyMap.get(taskEntity.name)!;
      
      // Update level if this path is shorter
      if (direction === 'dependsOn' && currentLevel < node.level) {
        node.level = currentLevel;
      }
      
      if (direction === 'dependsOn') {
        // Find tasks this task depends on
        for (const relation of graph.relations) {
          if (relation.relationType === 'depends_on' && relation.from === taskEntity.name) {
            const dependencyTask = graph.entities.find(e => e.name === relation.to && e.entityType === 'task');
            if (dependencyTask) {
              // Check if this dependency is already in the node's dependsOn list
              if (!node.dependsOn.some(d => d.task.name === dependencyTask.name)) {
                // Recursively add dependencies
                addDependencies(dependencyTask, currentLevel + 1, 'dependsOn');
                
                // Add this dependency to the node's dependsOn list
                const dependencyNode = dependencyMap.get(dependencyTask.name)!;
                node.dependsOn.push(dependencyNode);
                
                // Add the reverse relationship
                if (!dependencyNode.dependedOnBy.some(d => d.task.name === taskEntity.name)) {
                  dependencyNode.dependedOnBy.push(node);
                }
              }
            }
          }
        }
      } else { // direction === 'dependedOnBy'
        // Find tasks that depend on this task
        for (const relation of graph.relations) {
          if (relation.relationType === 'depends_on' && relation.to === taskEntity.name) {
            const dependentTask = graph.entities.find(e => e.name === relation.from && e.entityType === 'task');
            if (dependentTask) {
              // Check if this dependent is already in the node's dependedOnBy list
              if (!node.dependedOnBy.some(d => d.task.name === dependentTask.name)) {
                // Recursively add dependents
                addDependencies(dependentTask, currentLevel + 1, 'dependedOnBy');
                
                // Add this dependent to the node's dependedOnBy list
                const dependentNode = dependencyMap.get(dependentTask.name)!;
                node.dependedOnBy.push(dependentNode);
                
                // Add the reverse relationship
                if (!dependentNode.dependsOn.some(d => d.task.name === taskEntity.name)) {
                  dependentNode.dependsOn.push(node);
                }
              }
            }
          }
        }
      }
    };
    
    // Start with the main task and build the dependency tree in both directions
    addDependencies(task, 0, 'dependsOn');
    addDependencies(task, 0, 'dependedOnBy');
    
    // Convert to a serializable structure without circular references
    const serializableDependencies = Array.from(dependencyMap.values()).map(node => {
      const { task, level } = node;
      
      return {
        task,
        level,
        dependsOn: node.dependsOn.map(d => d.task.name),
        dependedOnBy: node.dependedOnBy.map(d => d.task.name),
        status: task.observations.find(o => o.startsWith('Status:'))?.split(':', 2)[1]?.trim() || 'not_started',
        dueDate: task.observations.find(o => o.startsWith('DueDate:'))?.split(':', 2)[1]?.trim(),
        assignee: this.getTaskAssignee(graph, task.name)
      };
    });
    
    // Sort by level (dependency depth)
    serializableDependencies.sort((a, b) => a.level - b.level);
    
    // Calculate the critical path
    const criticalPath = this.calculateCriticalPath(graph, serializableDependencies);
    
    return {
      task,
      projectName,
      dependencies: serializableDependencies,
      criticalPath,
      summary: {
        totalDependencies: serializableDependencies.length - 1, // Exclude the main task
        maxDepth: depth,
        blockedBy: serializableDependencies.filter(d => 
          d.task.name !== taskName && 
          d.status !== 'completed' && 
          task.observations.find(o => o.startsWith('Status:'))?.split(':', 2)[1]?.trim() !== 'completed'
        ).length
      }
    };
  }
  
  // Helper to find the assignee of a task
  private getTaskAssignee(graph: KnowledgeGraph, taskName: string): string | undefined {
    for (const relation of graph.relations) {
      if (relation.relationType === 'assigned_to' && relation.from === taskName) {
        const teamMember = graph.entities.find(e => e.name === relation.to && e.entityType === 'teamMember');
        if (teamMember) {
          return teamMember.name;
        }
      }
    }
    return undefined;
  }
  
  // Helper to calculate the critical path
  private calculateCriticalPath(graph: KnowledgeGraph, dependencies: any[]): string[] {
    // Simple implementation - find the longest chain of dependencies
    // A more sophisticated implementation would account for task durations
    
    // Create an adjacency list
    const adjacencyList = new Map<string, string[]>();
    
    // Initialize the adjacency list for all tasks
    for (const dep of dependencies) {
      adjacencyList.set(dep.task.name, []);
    }
    
    // Populate the adjacency list with dependencies
    for (const dep of dependencies) {
      for (const dependsOn of dep.dependsOn) {
        const list = adjacencyList.get(dependsOn) || [];
        list.push(dep.task.name);
        adjacencyList.set(dependsOn, list);
      }
    }
    
    // Find tasks with no dependencies (starting points)
    const startNodes = dependencies
      .filter(dep => dep.dependsOn.length === 0)
      .map(dep => dep.task.name);
    
    // Find tasks that no other tasks depend on (end points)
    const endNodes = dependencies
      .filter(dep => dep.dependedOnBy.length === 0)
      .map(dep => dep.task.name);
    
    // If there are multiple start or end nodes, we need a more sophisticated algorithm
    // For simplicity, we'll just find the longest path from any start to any end
    
    // Find all paths from start to end
    const allPaths: string[][] = [];
    
    const findPaths = (current: string, path: string[] = []) => {
      const newPath = [...path, current];
      
      if (endNodes.includes(current)) {
        allPaths.push(newPath);
        return;
      }
      
      const nextNodes = adjacencyList.get(current) || [];
      for (const next of nextNodes) {
        // Avoid cycles
        if (!path.includes(next)) {
          findPaths(next, newPath);
        }
      }
    };
    
    for (const start of startNodes) {
      findPaths(start);
    }
    
    // Find the longest path
    allPaths.sort((a, b) => b.length - a.length);
    
    return allPaths.length > 0 ? allPaths[0] : [];
  }

  // See all tasks assigned to a team member
  async getTeamMemberAssignments(teamMemberName: string): Promise<any> {
    const graph = await this.loadGraph();
    
    // Find the team member
    const teamMember = graph.entities.find(e => e.name === teamMemberName && e.entityType === 'teamMember');
    if (!teamMember) {
      throw new Error(`Team member '${teamMemberName}' not found`);
    }
    
    // Extract team member info
    const role = teamMember.observations.find(o => o.startsWith('Role:'))?.split(':', 2)[1]?.trim();
    const skills = teamMember.observations.find(o => o.startsWith('Skills:'))?.split(':', 2)[1]?.trim();
    const availability = teamMember.observations.find(o => o.startsWith('Availability:'))?.split(':', 2)[1]?.trim();
    
    // Find tasks assigned to this team member
    interface TaskAssignment {
      task: Entity;
      project: Entity | undefined;
      dueDate: string | undefined;
      status: string;
      priority: string | undefined;
    }
    
    const assignedTasks: TaskAssignment[] = [];
    
    // Find assigned tasks through 'assigned_to' relations
    for (const relation of graph.relations) {
      if (relation.relationType === 'assigned_to' && relation.to === teamMemberName) {
        const task = graph.entities.find(e => e.name === relation.from && e.entityType === 'task');
        if (task) {
          // Find the project this task belongs to
          let project: Entity | undefined;
          for (const taskRelation of graph.relations) {
            if (taskRelation.relationType === 'part_of' && taskRelation.from === task.name) {
              project = graph.entities.find(e => e.name === taskRelation.to && e.entityType === 'project');
              if (project) break;
            }
          }
          
          // Extract task info
          const dueDate = task.observations.find(o => o.startsWith('DueDate:'))?.split(':', 2)[1]?.trim();
          const status = task.observations.find(o => o.startsWith('Status:'))?.split(':', 2)[1]?.trim() || 'not_started';
          const priority = task.observations.find(o => o.startsWith('Priority:'))?.split(':', 2)[1]?.trim();
          
          assignedTasks.push({
            task,
            project,
            dueDate,
            status,
            priority
          });
        }
      }
    }
    
    // Sort tasks by due date
    assignedTasks.sort((a, b) => {
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
    });
    
    // Find projects this team member is involved in
    const projects: Entity[] = [];
    for (const relation of graph.relations) {
      if ((relation.relationType === 'manages' || relation.relationType === 'contributes_to') && 
          relation.from === teamMemberName) {
        const project = graph.entities.find(e => e.name === relation.to && e.entityType === 'project');
        if (project && !projects.some(p => p.name === project.name)) {
          projects.push(project);
        }
      }
    }
    
    // Group tasks by project
    const tasksByProject: { [projectName: string]: TaskAssignment[] } = {};
    for (const assignment of assignedTasks) {
      const projectName = assignment.project?.name || 'Unassigned';
      if (!tasksByProject[projectName]) {
        tasksByProject[projectName] = [];
      }
      tasksByProject[projectName].push(assignment);
    }
    
    // Group tasks by status
    const tasksByStatus: { [status: string]: TaskAssignment[] } = {};
    for (const assignment of assignedTasks) {
      if (!tasksByStatus[assignment.status]) {
        tasksByStatus[assignment.status] = [];
      }
      tasksByStatus[assignment.status].push(assignment);
    }
    
    // Calculate workload metrics
    const completedTasks = assignedTasks.filter(t => t.status === 'completed').length;
    const inProgressTasks = assignedTasks.filter(t => t.status === 'in_progress').length;
    const notStartedTasks = assignedTasks.filter(t => t.status === 'not_started').length;
    const blockedTasks = assignedTasks.filter(t => t.status === 'blocked').length;
    
    // Calculate upcoming deadlines
    const today = new Date();
    const upcomingDeadlines = assignedTasks
      .filter(t => {
        if (!t.dueDate || t.status === 'completed') return false;
        const dueDate = new Date(t.dueDate);
        const daysUntilDue = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        return daysUntilDue >= 0 && daysUntilDue <= 7; // Within the next week
      })
      .sort((a, b) => {
        return new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime();
      });
    
    // Find overdue tasks
    const overdueTasks = assignedTasks
      .filter(t => {
        if (!t.dueDate || t.status === 'completed') return false;
        const dueDate = new Date(t.dueDate);
        return dueDate < today;
      })
      .sort((a, b) => {
        return new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime();
      });
    
    return {
      teamMember,
      info: {
        role,
        skills,
        availability
      },
      workload: {
        totalTasks: assignedTasks.length,
        completedTasks,
        inProgressTasks,
        notStartedTasks,
        blockedTasks,
        completionRate: assignedTasks.length > 0 ? 
          Math.round((completedTasks / assignedTasks.length) * 100) : 0
      },
      assignedTasks,
      tasksByProject,
      tasksByStatus,
      projects,
      upcomingDeadlines,
      overdueTasks
    };
  }

  // Track progress toward project milestones
  async getMilestoneProgress(projectName: string, milestoneName?: string): Promise<any> {
    const graph = await this.loadGraph();
    
    // Find the project
    const project = graph.entities.find(e => e.name === projectName && e.entityType === 'project');
    if (!project) {
      throw new Error(`Project '${projectName}' not found`);
    }
    
    // Find milestones for this project, or a specific milestone if provided
    const milestones = milestoneName 
      ? graph.entities.filter(e => 
          e.name === milestoneName && 
          e.entityType === 'milestone' &&
          graph.relations.some(r => r.from === e.name && r.to === projectName && r.relationType === 'part_of')
        )
      : graph.entities.filter(e => 
          e.entityType === 'milestone' &&
          graph.relations.some(r => r.from === e.name && r.to === projectName && r.relationType === 'part_of')
        );
    
    if (milestoneName && milestones.length === 0) {
      throw new Error(`Milestone '${milestoneName}' not found in project '${projectName}'`);
    }
    
    // Process each milestone
    const milestoneProgress: any[] = [];
    
    for (const milestone of milestones) {
      // Extract milestone info
      const description = milestone.observations.find(o => o.startsWith('Description:'))?.split(':', 2)[1]?.trim();
      const date = milestone.observations.find(o => o.startsWith('Date:'))?.split(':', 2)[1]?.trim();
      const status = milestone.observations.find(o => o.startsWith('Status:'))?.split(':', 2)[1]?.trim() || 'planned';
      const criteria = milestone.observations.find(o => o.startsWith('Criteria:'))?.split(':', 2)[1]?.trim();
      
      // Find related tasks
      const relatedTasks: Entity[] = [];
      for (const relation of graph.relations) {
        if (relation.relationType === 'required_for' && relation.to === milestone.name) {
          const task = graph.entities.find(e => e.name === relation.from && e.entityType === 'task');
          if (task) {
            relatedTasks.push(task);
          }
        }
      }
      
      // Calculate task completion for this milestone
      const completedTasks = relatedTasks.filter(task => 
        task.observations.find(o => o.startsWith('Status:'))?.split(':', 2)[1]?.trim() === 'completed'
      ).length;
      
      const completionPercentage = relatedTasks.length > 0 
        ? Math.round((completedTasks / relatedTasks.length) * 100) 
        : status === 'reached' ? 100 : 0;
      
      // Calculate days until/since milestone
      let daysRemaining: number | null = null;
      let isOverdue = false;
      
      if (date) {
        const milestoneDate = new Date(date);
        const today = new Date();
        const diffTime = milestoneDate.getTime() - today.getTime();
        daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        isOverdue = diffTime < 0 && status !== 'reached' && status !== 'missed';
      }
      
      // Find blockers (incomplete tasks that are required)
      const blockers = relatedTasks.filter(task => {
        const taskStatus = task.observations.find(o => o.startsWith('Status:'))?.split(':', 2)[1]?.trim();
        return taskStatus !== 'completed' && taskStatus !== 'cancelled';
      });
      
      milestoneProgress.push({
        milestone,
        info: {
          description,
          date,
          status,
          criteria
        },
        progress: {
          totalTasks: relatedTasks.length,
          completedTasks,
          completionPercentage,
          daysRemaining,
          isOverdue
        },
        relatedTasks,
        blockers
      });
    }
    
    // Sort milestones by date
    milestoneProgress.sort((a, b) => {
      if (!a.info.date) return 1;
      if (!b.info.date) return -1;
      return new Date(a.info.date).getTime() - new Date(b.info.date).getTime();
    });
    
    // Calculate overall project milestone progress
    const totalMilestones = milestoneProgress.length;
    const reachedMilestones = milestoneProgress.filter(m => m.info.status === 'reached').length;
    const averageCompletion = totalMilestones > 0
      ? milestoneProgress.reduce((sum, m) => sum + m.progress.completionPercentage, 0) / totalMilestones
      : 0;
    
    return {
      project,
      milestones: milestoneProgress,
      summary: {
        totalMilestones,
        reachedMilestones,
        milestoneCompletionRate: totalMilestones > 0 ? Math.round((reachedMilestones / totalMilestones) * 100) : 0,
        averageCompletion: Math.round(averageCompletion),
        nextMilestone: milestoneProgress.find(m => 
          m.info.status !== 'reached' && m.info.status !== 'missed'
        ),
        overdueMilestones: milestoneProgress.filter(m => m.progress.isOverdue).length
      }
    };
  }

  // Create a timeline view with important dates
  async getProjectTimeline(projectName: string): Promise<any> {
    const graph = await this.loadGraph();
    
    // Find the project
    const project = graph.entities.find(e => e.name === projectName && e.entityType === 'project');
    if (!project) {
      throw new Error(`Project '${projectName}' not found`);
    }
    
    // Extract project dates
    const projectStartDate = project.observations.find(o => o.startsWith('StartDate:'))?.split(':', 2)[1]?.trim();
    const projectEndDate = project.observations.find(o => o.startsWith('EndDate:'))?.split(':', 2)[1]?.trim();
    
    // Create a timeline of all dated events
    interface TimelineEvent {
      date: Date;
      entity: Entity;
      eventType: 'milestone' | 'task' | 'meeting' | 'project_start' | 'project_end';
      description?: string;
      status?: string;
    }
    
    const timelineEvents: TimelineEvent[] = [];
    
    // Add project start and end dates
    if (projectStartDate) {
      timelineEvents.push({
        date: new Date(projectStartDate),
        entity: project,
        eventType: 'project_start',
        description: 'Project Start'
      });
    }
    
    if (projectEndDate) {
      timelineEvents.push({
        date: new Date(projectEndDate),
        entity: project,
        eventType: 'project_end',
        description: 'Project End'
      });
    }
    
    // Find milestones for this project
    const milestones = graph.entities.filter(e => 
      e.entityType === 'milestone' &&
      graph.relations.some(r => r.from === e.name && r.to === projectName && r.relationType === 'part_of')
    );
    
    // Add milestones to timeline
    for (const milestone of milestones) {
      const date = milestone.observations.find(o => o.startsWith('Date:'))?.split(':', 2)[1]?.trim();
      if (date) {
        timelineEvents.push({
          date: new Date(date),
          entity: milestone,
          eventType: 'milestone',
          description: milestone.observations.find(o => o.startsWith('Description:'))?.split(':', 2)[1]?.trim(),
          status: milestone.observations.find(o => o.startsWith('Status:'))?.split(':', 2)[1]?.trim()
        });
      }
    }
    
    // Find tasks with due dates
    const tasks = graph.entities.filter(e => 
      e.entityType === 'task' &&
      graph.relations.some(r => r.from === e.name && r.to === projectName && r.relationType === 'part_of')
    );
    
    // Add tasks to timeline
    for (const task of tasks) {
      const dueDate = task.observations.find(o => o.startsWith('DueDate:'))?.split(':', 2)[1]?.trim();
      if (dueDate) {
        timelineEvents.push({
          date: new Date(dueDate),
          entity: task,
          eventType: 'task',
          description: task.observations.find(o => o.startsWith('Description:'))?.split(':', 2)[1]?.trim(),
          status: task.observations.find(o => o.startsWith('Status:'))?.split(':', 2)[1]?.trim()
        });
      }
    }
    
    // Sort timeline events by date
    timelineEvents.sort((a, b) => a.date.getTime() - b.date.getTime());
    
    // Calculate time spans between events
    const timelineWithSpans = timelineEvents.map((event, index) => {
      let daysFromStart = 0;
      let daysToNext = 0;
      
      if (index === 0 && projectStartDate) {
        // First event relative to project start
        daysFromStart = 0;
      } else if (index > 0) {
        // Days from previous event
        const prevDate = timelineEvents[index - 1].date;
        daysFromStart = Math.round((event.date.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24));
      }
      
      if (index < timelineEvents.length - 1) {
        // Days until next event
        const nextDate = timelineEvents[index + 1].date;
        daysToNext = Math.round((nextDate.getTime() - event.date.getTime()) / (1000 * 60 * 60 * 24));
      }
      
      return {
        ...event,
        dateString: event.date.toISOString().split('T')[0],
        daysFromStart,
        daysToNext
      };
    });
    
    // Find the current position in the timeline
    const today = new Date();
    let currentPosition = -1;
    
    for (let i = 0; i < timelineEvents.length; i++) {
      if (timelineEvents[i].date >= today) {
        currentPosition = i;
        break;
      }
    }
    
    // If we're past all events, set current position to the last event
    if (currentPosition === -1 && timelineEvents.length > 0) {
      currentPosition = timelineEvents.length - 1;
    }
    
    // Calculate overall project progress based on timeline
    let progressPercentage = 0;
    
    if (timelineEvents.length >= 2) {
      const startDate = timelineEvents[0].date;
      const endDate = timelineEvents[timelineEvents.length - 1].date;
      const totalDuration = endDate.getTime() - startDate.getTime();
      
      if (totalDuration > 0) {
        const elapsed = today.getTime() - startDate.getTime();
        progressPercentage = Math.min(100, Math.max(0, Math.round((elapsed / totalDuration) * 100)));
      }
    }
    
    return {
      project,
      timeline: timelineWithSpans,
      currentPosition,
      progressPercentage,
      projectDuration: timelineEvents.length >= 2 ? 
        Math.round((timelineEvents[timelineEvents.length - 1].date.getTime() - timelineEvents[0].date.getTime()) / (1000 * 60 * 60 * 24)) : 0,
      upcomingEvents: timelineWithSpans.filter(e => e.date >= today).slice(0, 5)
    };
  }

  // Shows how resources are allocated across the project
  async getResourceAllocation(projectName: string, resourceName?: string): Promise<any> {
    const graph = await this.loadGraph();
    
    // Find the project
    const project = graph.entities.find(e => e.name === projectName && e.entityType === 'project');
    if (!project) {
      throw new Error(`Project '${projectName}' not found`);
    }
    
    // Find resources for this project, or a specific resource if provided
    const resources = resourceName 
      ? graph.entities.filter(e => 
          e.name === resourceName && 
          e.entityType === 'resource' &&
          graph.relations.some(r => r.from === e.name && r.to === projectName && r.relationType === 'part_of')
        )
      : graph.entities.filter(e => 
          e.entityType === 'resource' &&
          graph.relations.some(r => r.from === e.name && r.to === projectName && r.relationType === 'part_of')
        );
    
    if (resourceName && resources.length === 0) {
      throw new Error(`Resource '${resourceName}' not found in project '${projectName}'`);
    }
    
    // Process each resource
    const resourceAllocations = [];
    
    for (const resource of resources) {
      // Extract resource info
      const type = resource.observations.find(o => o.startsWith('Type:'))?.split(':', 2)[1]?.trim();
      const availability = resource.observations.find(o => o.startsWith('Availability:'))?.split(':', 2)[1]?.trim();
      const capacity = resource.observations.find(o => o.startsWith('Capacity:'))?.split(':', 2)[1]?.trim();
      const cost = resource.observations.find(o => o.startsWith('Cost:'))?.split(':', 2)[1]?.trim();
      
      // Find tasks that use this resource
      const assignedTasks: Entity[] = [];
      for (const relation of graph.relations) {
        if (relation.relationType === 'requires' && relation.to === resource.name) {
          const task = graph.entities.find(e => e.name === relation.from && e.entityType === 'task');
          if (task) {
            assignedTasks.push(task);
          }
        }
      }
      
      // Sort tasks by due date
      assignedTasks.sort((a, b) => {
        const aDate = a.observations.find(o => o.startsWith('DueDate:'))?.split(':', 2)[1]?.trim() || '';
        const bDate = b.observations.find(o => o.startsWith('DueDate:'))?.split(':', 2)[1]?.trim() || '';
        if (!aDate) return 1;
        if (!bDate) return -1;
        return new Date(aDate).getTime() - new Date(bDate).getTime();
      });
      
      // Group tasks by status
      const tasksByStatus: { [status: string]: Entity[] } = {};
      for (const task of assignedTasks) {
        const status = task.observations.find(o => o.startsWith('Status:'))?.split(':', 2)[1]?.trim() || 'not_started';
        if (!tasksByStatus[status]) {
          tasksByStatus[status] = [];
        }
        tasksByStatus[status].push(task);
      }
      
      // Find team members using this resource
      const teamMembers: Entity[] = [];
      for (const relation of graph.relations) {
        if (relation.relationType === 'uses' && relation.to === resource.name) {
          const teamMember = graph.entities.find(e => e.name === relation.from && e.entityType === 'teamMember');
          if (teamMember) {
            teamMembers.push(teamMember);
          }
        }
      }
      
      // Calculate usage percentage based on assigned tasks
      const totalTasks = assignedTasks.length;
      const inProgressTasks = tasksByStatus['in_progress']?.length || 0;
      
      // Simple formula for usage percentage
      const usagePercentage = capacity 
        ? Math.min(100, Math.round((inProgressTasks / parseInt(capacity)) * 100)) 
        : totalTasks > 0 ? 50 : 0; // Default to 50% if we have tasks but no capacity
      
      resourceAllocations.push({
        resource,
        info: {
          type,
          availability,
          capacity,
          cost
        },
        usage: {
          totalTasks,
          inProgressTasks,
          usagePercentage
        },
        assignedTasks,
        tasksByStatus,
        teamMembers
      });
    }
    
    // Sort resources by usage percentage (descending)
    resourceAllocations.sort((a, b) => b.usage.usagePercentage - a.usage.usagePercentage);
    
    // Identify overallocated resources
    const overallocatedResources = resourceAllocations.filter(r => r.usage.usagePercentage > 90);
    
    // Identify underutilized resources
    const underutilizedResources = resourceAllocations.filter(r => r.usage.usagePercentage < 20 && r.usage.totalTasks > 0);
    
    return {
      project,
      resources: resourceAllocations,
      summary: {
        totalResources: resources.length,
        overallocatedCount: overallocatedResources.length,
        underutilizedCount: underutilizedResources.length
      },
      overallocatedResources,
      underutilizedResources
    };
  }

  // Identifies potential risks and their impact
  async getProjectRisks(projectName: string): Promise<any> {
    const graph = await this.loadGraph();
    
    // Find the project
    const project = graph.entities.find(e => e.name === projectName && e.entityType === 'project');
    if (!project) {
      throw new Error(`Project '${projectName}' not found`);
    }
    
    // Find risks for this project
    const risks = graph.entities.filter(e => 
      e.entityType === 'risk' &&
      graph.relations.some(r => r.from === e.name && r.to === projectName && r.relationType === 'part_of')
    );
    
    // Process each risk
    const processedRisks = [];
    
    for (const risk of risks) {
      // Extract risk info
      const description = risk.observations.find(o => o.startsWith('Description:'))?.split(':', 2)[1]?.trim();
      const likelihood = risk.observations.find(o => o.startsWith('Likelihood:'))?.split(':', 2)[1]?.trim();
      const impact = risk.observations.find(o => o.startsWith('Impact:'))?.split(':', 2)[1]?.trim();
      const status = risk.observations.find(o => o.startsWith('Status:'))?.split(':', 2)[1]?.trim() || 'identified';
      const mitigation = risk.observations.find(o => o.startsWith('Mitigation:'))?.split(':', 2)[1]?.trim();
      
      // Calculate risk score (if likelihood and impact are numerical)
      let riskScore: number | undefined;
      
      if (likelihood && impact) {
        const likelihoodValue = parseInt(likelihood);
        const impactValue = parseInt(impact);
        if (!isNaN(likelihoodValue) && !isNaN(impactValue)) {
          riskScore = likelihoodValue * impactValue;
        }
      }
      
      // Find components or tasks affected by this risk
      const affectedEntities: Entity[] = [];
      for (const relation of graph.relations) {
        if (relation.relationType === 'impacted_by' && relation.to === risk.name) {
          const entity = graph.entities.find(e => e.name === relation.from);
          if (entity) {
            affectedEntities.push(entity);
          }
        }
      }
      
      processedRisks.push({
        risk,
        info: {
          description,
          likelihood,
          impact,
          status,
          mitigation,
          riskScore
        },
        affectedEntities
      });
    }
    
    // Sort risks by risk score (descending)
    processedRisks.sort((a, b) => {
      if (a.info.riskScore === undefined) return 1;
      if (b.info.riskScore === undefined) return -1;
      return b.info.riskScore - a.info.riskScore;
    });
    
    // Group risks by status
    const risksByStatus: { [status: string]: any[] } = {};
    for (const processedRisk of processedRisks) {
      const status = processedRisk.info.status;
      if (!risksByStatus[status]) {
        risksByStatus[status] = [];
      }
      risksByStatus[status].push(processedRisk);
    }
    
    // Identify high-priority risks
    const highPriorityRisks = processedRisks.filter(r => {
      if (r.info.riskScore !== undefined) {
        return r.info.riskScore >= 15; // Threshold for high priority
      }
      return r.info.impact === 'high' || r.info.likelihood === 'high';
    });
    
    return {
      project,
      risks: processedRisks,
      risksByStatus,
      summary: {
        totalRisks: risks.length,
        highPriorityCount: highPriorityRisks.length,
        mitigatedCount: risksByStatus['mitigating']?.length || 0,
        avoidedCount: risksByStatus['avoided']?.length || 0,
        acceptedCount: risksByStatus['accepted']?.length || 0,
        occurredCount: risksByStatus['occurred']?.length || 0
      },
      highPriorityRisks
    };
  }

  // Find connections between different projects
  async findRelatedProjects(projectName: string, depth: number = 1): Promise<any> {
    const graph = await this.loadGraph();
    
    // Find the project
    const project = graph.entities.find(e => e.name === projectName && e.entityType === 'project');
    if (!project) {
      throw new Error(`Project '${projectName}' not found`);
    }
    
    interface ProjectConnection {
      project: Entity;
      connectionType: string;
      connectionStrength: number;
      sharedEntities: {
        teamMembers: Entity[];
        dependencies: Entity[];
        resources: Entity[];
        stakeholders: Entity[];
      };
    }
    
    const relatedProjects: ProjectConnection[] = [];
    const processedProjects = new Set<string>([projectName]);
    
    // Helper function to find connections between projects
    const findConnections = (currentProjectName: string, currentDepth: number) => {
      if (currentDepth > depth) return;
      
      // Find all other projects
      const otherProjects = graph.entities.filter(e => 
        e.entityType === 'project' && 
        e.name !== currentProjectName &&
        !processedProjects.has(e.name)
      );
      
      for (const otherProject of otherProjects) {
        // Add to processed set to avoid cycles
        processedProjects.add(otherProject.name);
        
        // Find shared team members
        const sharedTeamMembers: Entity[] = [];
        const projectTeamMembers = new Set<string>();
        const otherProjectTeamMembers = new Set<string>();
        
        // Get team members for current project
        for (const relation of graph.relations) {
          if ((relation.relationType === 'assigned_to' || relation.relationType === 'contributes_to' || relation.relationType === 'manages') && 
              relation.to === currentProjectName) {
            const teamMember = graph.entities.find(e => e.name === relation.from && e.entityType === 'teamMember');
            if (teamMember) {
              projectTeamMembers.add(teamMember.name);
            }
          }
        }
        
        // Get team members for other project
        for (const relation of graph.relations) {
          if ((relation.relationType === 'assigned_to' || relation.relationType === 'contributes_to' || relation.relationType === 'manages') && 
              relation.to === otherProject.name) {
            const teamMember = graph.entities.find(e => e.name === relation.from && e.entityType === 'teamMember');
            if (teamMember) {
              otherProjectTeamMembers.add(teamMember.name);
              if (projectTeamMembers.has(teamMember.name)) {
                sharedTeamMembers.push(teamMember);
              }
            }
          }
        }
        
        // Find shared resources
        const sharedResources: Entity[] = [];
        const projectResources = new Set<string>();
        const otherProjectResources = new Set<string>();
        
        // Get resources for current project
        for (const relation of graph.relations) {
          if (relation.relationType === 'part_of' && relation.to === currentProjectName) {
            const resource = graph.entities.find(e => e.name === relation.from && e.entityType === 'resource');
            if (resource) {
              projectResources.add(resource.name);
            }
          }
        }
        
        // Get resources for other project
        for (const relation of graph.relations) {
          if (relation.relationType === 'part_of' && relation.to === otherProject.name) {
            const resource = graph.entities.find(e => e.name === relation.from && e.entityType === 'resource');
            if (resource) {
              otherProjectResources.add(resource.name);
              if (projectResources.has(resource.name)) {
                sharedResources.push(resource);
              }
            }
          }
        }
        
        // Find shared stakeholders
        const sharedStakeholders: Entity[] = [];
        const projectStakeholders = new Set<string>();
        const otherProjectStakeholders = new Set<string>();
        
        // Get stakeholders for current project
        for (const relation of graph.relations) {
          if (relation.relationType === 'stakeholder_of' && relation.to === currentProjectName) {
            const stakeholder = graph.entities.find(e => e.name === relation.from && e.entityType === 'stakeholder');
            if (stakeholder) {
              projectStakeholders.add(stakeholder.name);
            }
          }
        }
        
        // Get stakeholders for other project
        for (const relation of graph.relations) {
          if (relation.relationType === 'stakeholder_of' && relation.to === otherProject.name) {
            const stakeholder = graph.entities.find(e => e.name === relation.from && e.entityType === 'stakeholder');
            if (stakeholder) {
              otherProjectStakeholders.add(stakeholder.name);
              if (projectStakeholders.has(stakeholder.name)) {
                sharedStakeholders.push(stakeholder);
              }
            }
          }
        }
        
        // Find dependencies between projects
        const dependencies: Entity[] = [];
        
        // Check for 'depends_on' relations between projects
        for (const relation of graph.relations) {
          if (relation.relationType === 'depends_on') {
            if (relation.from === currentProjectName && relation.to === otherProject.name) {
              dependencies.push(otherProject);
            } else if (relation.from === otherProject.name && relation.to === currentProjectName) {
              dependencies.push(project);
            }
          }
        }
        
        // Calculate connection strength (simple formula based on shared entities)
        const connectionStrength = 
          (sharedTeamMembers.length * 2) + // Team members have higher weight
          (sharedResources.length * 1.5) + // Resources are also important
          (dependencies.length * 3) +      // Dependencies have highest weight
          (sharedStakeholders.length * 1); // Stakeholders have standard weight
        
        // Determine primary connection type
        let connectionType = 'related';
        
        if (dependencies.length > 0) {
          connectionType = 'dependency';
        } else if (sharedTeamMembers.length > 0) {
          connectionType = 'shared_team';
        } else if (sharedResources.length > 0) {
          connectionType = 'shared_resources';
        } else if (sharedStakeholders.length > 0) {
          connectionType = 'shared_stakeholders';
        }
        
        // Only add connections with some relationship
        if (connectionStrength > 0) {
          relatedProjects.push({
            project: otherProject,
            connectionType,
            connectionStrength,
            sharedEntities: {
              teamMembers: sharedTeamMembers,
              dependencies,
              resources: sharedResources,
              stakeholders: sharedStakeholders
            }
          });
          
          // Recursively find connections for this project (up to the specified depth)
          findConnections(otherProject.name, currentDepth + 1);
        }
      }
    };
    
    // Start the recursive search
    findConnections(projectName, 1);
    
    // Sort related projects by connection strength
    relatedProjects.sort((a, b) => b.connectionStrength - a.connectionStrength);
    
    return {
      project,
      relatedProjects,
      summary: {
        totalRelated: relatedProjects.length,
        byConnectionType: {
          dependency: relatedProjects.filter(p => p.connectionType === 'dependency').length,
          shared_team: relatedProjects.filter(p => p.connectionType === 'shared_team').length,
          shared_resources: relatedProjects.filter(p => p.connectionType === 'shared_resources').length,
          shared_stakeholders: relatedProjects.filter(p => p.connectionType === 'shared_stakeholders').length
        },
        maxDepth: depth
      }
    };
  }

  // Get decision log for a project
  async getDecisionLog(projectName: string): Promise<any> {
    const graph = await this.loadGraph();
    
    // Find the project
    const project = graph.entities.find(e => e.name === projectName && e.entityType === 'project');
    if (!project) {
      throw new Error(`Project '${projectName}' not found`);
    }
    
    // Find decisions for this project
    const decisions = graph.entities.filter(e => 
      e.entityType === 'decision' &&
      graph.relations.some(r => r.from === e.name && r.to === projectName && r.relationType === 'part_of')
    );
    
    // Process each decision
    const processedDecisions = [];
    
    for (const decision of decisions) {
      // Extract decision info
      const description = decision.observations.find(o => o.startsWith('Description:'))?.split(':', 2)[1]?.trim();
      const date = decision.observations.find(o => o.startsWith('Date:'))?.split(':', 2)[1]?.trim();
      const status = decision.observations.find(o => o.startsWith('Status:'))?.split(':', 2)[1]?.trim() || 'proposed';
      const rationale = decision.observations.find(o => o.startsWith('Rationale:'))?.split(':', 2)[1]?.trim();
      const alternatives = decision.observations.find(o => o.startsWith('Alternatives:'))?.split(':', 2)[1]?.trim();
      
      // Find team members involved in this decision
      const involvedTeamMembers: Entity[] = [];
      for (const relation of graph.relations) {
        if (relation.relationType === 'created_by' && relation.from === decision.name) {
          const teamMember = graph.entities.find(e => e.name === relation.to && e.entityType === 'teamMember');
          if (teamMember) {
            involvedTeamMembers.push(teamMember);
          }
        }
      }
      
      // Find entities affected by this decision
      const affectedEntities: Entity[] = [];
      for (const relation of graph.relations) {
        if (relation.relationType === 'impacted_by' && relation.to === decision.name) {
          const entity = graph.entities.find(e => e.name === relation.from);
          if (entity) {
            affectedEntities.push(entity);
          }
        }
      }
      
      processedDecisions.push({
        decision,
        info: {
          description,
          date,
          status,
          rationale,
          alternatives
        },
        involvedTeamMembers,
        affectedEntities
      });
    }
    
    // Sort decisions by date (most recent first)
    processedDecisions.sort((a, b) => {
      if (!a.info.date) return 1;
      if (!b.info.date) return -1;
      return new Date(b.info.date).getTime() - new Date(a.info.date).getTime();
    });
    
    // Group decisions by status
    const decisionsByStatus: { [status: string]: any[] } = {};
    for (const processedDecision of processedDecisions) {
      const status = processedDecision.info.status;
      if (!decisionsByStatus[status]) {
        decisionsByStatus[status] = [];
      }
      decisionsByStatus[status].push(processedDecision);
    }
    
    return {
      project,
      decisions: processedDecisions,
      decisionsByStatus,
      summary: {
        totalDecisions: decisions.length,
        approvedCount: decisionsByStatus['approved']?.length || 0,
        implementedCount: decisionsByStatus['implemented']?.length || 0,
        rejectedCount: decisionsByStatus['rejected']?.length || 0,
        proposedCount: decisionsByStatus['proposed']?.length || 0
      }
    };
  }

  // Analyze the overall health of the project
  async getProjectHealth(projectName: string): Promise<any> {
    const graph = await this.loadGraph();
    
    // Find the project
    const project = graph.entities.find(e => e.name === projectName && e.entityType === 'project');
    if (!project) {
      throw new Error(`Project '${projectName}' not found`);
    }
    
    // Get project information
    const status = project.observations.find(o => o.startsWith('Status:'))?.split(':', 2)[1]?.trim() || 'planning';
    const startDate = project.observations.find(o => o.startsWith('StartDate:'))?.split(':', 2)[1]?.trim();
    const endDate = project.observations.find(o => o.startsWith('EndDate:'))?.split(':', 2)[1]?.trim();
    
    // Helper function to get entities of a specific type for this project
    const getProjectEntities = (entityType: EntityType) => {
      return graph.entities.filter(e => 
        e.entityType === entityType &&
        graph.relations.some(r => r.from === e.name && r.to === projectName && r.relationType === 'part_of')
      );
    };
    
    // Get counts of various entities
    const tasks = getProjectEntities('task');
    const milestones = getProjectEntities('milestone');
    const issues = getProjectEntities('issue');
    const risks = getProjectEntities('risk');
    
    // Calculate task metrics
    const completedTasks = tasks.filter(t => 
      t.observations.find(o => o.startsWith('Status:'))?.split(':', 2)[1]?.trim() === 'completed'
    ).length;
    
    const blockedTasks = tasks.filter(t => 
      t.observations.find(o => o.startsWith('Status:'))?.split(':', 2)[1]?.trim() === 'blocked'
    ).length;
    
    const taskCompletionRate = tasks.length > 0 ? (completedTasks / tasks.length) * 100 : 0;
    
    // Calculate milestone metrics
    const reachedMilestones = milestones.filter(m => 
      m.observations.find(o => o.startsWith('Status:'))?.split(':', 2)[1]?.trim() === 'reached'
    ).length;
    
    const missedMilestones = milestones.filter(m => 
      m.observations.find(o => o.startsWith('Status:'))?.split(':', 2)[1]?.trim() === 'missed'
    ).length;
    
    const milestoneCompletionRate = milestones.length > 0 ? (reachedMilestones / milestones.length) * 100 : 0;
    
    // Calculate issue metrics
    const resolvedIssues = issues.filter(i => 
      i.observations.find(o => o.startsWith('Status:'))?.split(':', 2)[1]?.trim() === 'resolved'
    ).length;
    
    const openIssues = issues.length - resolvedIssues;
    
    // Calculate risk metrics
    const mitigatedRisks = risks.filter(r => 
      r.observations.find(o => o.startsWith('Status:'))?.split(':', 2)[1]?.trim() === 'mitigating' ||
      r.observations.find(o => o.startsWith('Status:'))?.split(':', 2)[1]?.trim() === 'avoided'
    ).length;
    
    const activeRisks = risks.filter(r => 
      r.observations.find(o => o.startsWith('Status:'))?.split(':', 2)[1]?.trim() === 'identified' ||
      r.observations.find(o => o.startsWith('Status:'))?.split(':', 2)[1]?.trim() === 'monitoring'
    ).length;
    
    // Calculate timeline metrics
    let timelineProgress = 0;
    let behindSchedule = false;
    
    if (startDate && endDate) {
      const start = new Date(startDate).getTime();
      const end = new Date(endDate).getTime();
      const now = new Date().getTime();
      
      if (end > start) {
        // Calculate percentage of timeline elapsed
        const totalDuration = end - start;
        const elapsed = now - start;
        const timeElapsedPercent = Math.min(100, Math.max(0, (elapsed / totalDuration) * 100));
        
        // Calculate if project is behind schedule (completion percentage significantly less than time elapsed)
        behindSchedule = taskCompletionRate < (timeElapsedPercent - 15); // More than 15% behind
        
        timelineProgress = Math.round(timeElapsedPercent);
      }
    }
    
    // Calculate overall health score
    // This is a simple formula - can be adjusted based on specific project needs
    const healthFactors = [
      // Task factors
      tasks.length > 0 ? Math.min(100, taskCompletionRate) : 50,
      tasks.length > 0 ? Math.max(0, 100 - (blockedTasks / tasks.length) * 200) : 50,
      
      // Milestone factors
      milestones.length > 0 ? Math.min(100, milestoneCompletionRate) : 50,
      milestones.length > 0 ? Math.max(0, 100 - (missedMilestones / milestones.length) * 200) : 50,
      
      // Issue factors
      issues.length > 0 ? Math.min(100, (resolvedIssues / issues.length) * 100) : 50,
      issues.length > 0 ? Math.max(0, 100 - (openIssues / issues.length) * 100) : 50,
      
      // Risk factors
      risks.length > 0 ? Math.min(100, (mitigatedRisks / risks.length) * 100) : 50,
      risks.length > 0 ? Math.max(0, 100 - (activeRisks / risks.length) * 100) : 50,
      
      // Schedule factor
      behindSchedule ? 30 : 70 // Penalize being behind schedule
    ];
    
    // Average the health factors
    const healthScore = Math.round(healthFactors.reduce((sum, factor) => sum + factor, 0) / healthFactors.length);
    
    // Determine health status
    let healthStatus;
    if (healthScore >= 80) {
      healthStatus = 'healthy';
    } else if (healthScore >= 60) {
      healthStatus = 'attention_needed';
    } else if (healthScore >= 40) {
      healthStatus = 'at_risk';
    } else {
      healthStatus = 'critical';
    }
    
    // Find top issues (if any)
    const topIssues = issues
      .filter(i => 
        i.observations.find(o => o.startsWith('Status:'))?.split(':', 2)[1]?.trim() !== 'resolved' &&
        i.observations.find(o => o.startsWith('Status:'))?.split(':', 2)[1]?.trim() !== 'wont_fix'
      )
      .sort((a, b) => {
        const aPriority = a.observations.find(o => o.startsWith('Priority:'))?.split(':', 2)[1]?.trim() || 'medium';
        const bPriority = b.observations.find(o => o.startsWith('Priority:'))?.split(':', 2)[1]?.trim() || 'medium';
        
        // Simple priority sorting
        if (aPriority === 'high' && bPriority !== 'high') return -1;
        if (aPriority !== 'high' && bPriority === 'high') return 1;
        if (aPriority === 'medium' && bPriority === 'low') return -1;
        if (aPriority === 'low' && bPriority === 'medium') return 1;
        return 0;
      })
      .slice(0, 3); // Top 3 issues
    
    return {
      project,
      healthScore,
      healthStatus,
      metrics: {
        tasks: {
          total: tasks.length,
          completed: completedTasks,
          blocked: blockedTasks,
          completionRate: Math.round(taskCompletionRate)
        },
        milestones: {
          total: milestones.length,
          reached: reachedMilestones,
          missed: missedMilestones,
          completionRate: Math.round(milestoneCompletionRate)
        },
        issues: {
          total: issues.length,
          resolved: resolvedIssues,
          open: openIssues,
          resolutionRate: issues.length > 0 ? Math.round((resolvedIssues / issues.length) * 100) : 0
        },
        risks: {
          total: risks.length,
          mitigated: mitigatedRisks,
          active: activeRisks,
          mitigationRate: risks.length > 0 ? Math.round((mitigatedRisks / risks.length) * 100) : 0
        },
        timeline: {
          progress: timelineProgress,
          behindSchedule
        }
      },
      topIssues,
      recommendations: this.generateHealthRecommendations(healthStatus, {
        tasks,
        milestones,
        issues,
        risks,
        behindSchedule
      })
    };
  }
  
  // Helper method to generate health recommendations
  private generateHealthRecommendations(healthStatus: string, metrics: any): string[] {
    const recommendations: string[] = [];
    
    switch (healthStatus) {
      case 'healthy':
        recommendations.push('Continue current management practices');
        recommendations.push('Document successful strategies for future projects');
        break;
        
      case 'attention_needed':
        if (metrics.tasks.blocked > 0) {
          recommendations.push('Address blocked tasks to maintain momentum');
        }
        if (metrics.issues.open > 2) {
          recommendations.push('Resolve open issues to prevent escalation');
        }
        if (metrics.behindSchedule) {
          recommendations.push('Review project timeline and adjust as needed');
        }
        break;
        
      case 'at_risk':
        if (metrics.tasks.blocked > 0) {
          recommendations.push('Urgently resolve blocked tasks - consider reassigning resources');
        }
        if (metrics.behindSchedule) {
          recommendations.push('Reevaluate project scope and timeline - consider adjustments');
        }
        if (metrics.risks.active > 0) {
          recommendations.push('Implement mitigation strategies for active risks immediately');
        }
        if (metrics.issues.open > 0) {
          recommendations.push('Prioritize issue resolution and prevent new issues');
        }
        break;
        
      case 'critical':
        recommendations.push('Conduct emergency project review with stakeholders');
        recommendations.push('Consider project restructuring or reset');
        recommendations.push('Implement daily status meetings and tight monitoring');
        if (metrics.tasks.blocked > 0) {
          recommendations.push('Escalate blocked tasks to management for immediate action');
        }
        if (metrics.risks.active > 0) {
          recommendations.push('Reassess all project risks and implement mitigation measures');
        }
        break;
    }
    
    return recommendations;
  }
}

// Setup the MCP server
async function main() {
  try {
    const knowledgeGraphManager = new KnowledgeGraphManager();
    
    // Create the MCP server with a name and version
    const server = new McpServer({
      name: "Context Manager",
      version: "1.0.0"
    });
    
    // Define a resource that exposes the entire graph
    server.resource(
      "graph",
      "graph://project",
      async (uri) => ({
        contents: [{
          uri: uri.href,
          text: JSON.stringify(await knowledgeGraphManager.readGraph(), null, 2)
        }]
      })
    );

    /**
     * Start a new work session. Returns session ID, recent sessions, active projects, high-priority tasks, upcoming milestones, and project health summary.
     */
    server.tool(
      "startsession",
      toolDescriptions["startsession"],
      {},
      async () => {
        try {
          // Generate a unique session ID
          const sessionId = generateSessionId();
          
          // Get recent sessions from persistent storage instead of entities
          const allSessionStates = await loadSessionStates();
          
          // Convert sessions map to array, sort by date, and take most recent ones
          const recentSessions = Array.from(allSessionStates.entries())
            .map(([id, stages]) => {
              // Extract summary data from the first stage (if it exists)
              const summaryStage = stages.find(s => s.stage === "summary");
              return {
                id,
                date: summaryStage?.stageData?.date || "Unknown date",
                project: summaryStage?.stageData?.project || "Unknown project",
                summary: summaryStage?.stageData?.summary || "No summary available"
              };
            })
            .sort((a, b) => b.date.localeCompare(a.date))
            .slice(0, 3); // Default to 3 recent sessions
          
          // Get active projects
          const projectsQuery = await knowledgeGraphManager.searchNodes("entityType:project status:active");
          const projects = projectsQuery.entities;
          
          // Get high priority tasks
          let highPriorityTasks: Entity[] = [];
          let projectHealthData: any[] = [];
          let projectMilestones: any[] = [];
          let projectRisks: any[] = [];
          
          // For each project, get more detailed information
          for (const project of projects) {
            const projectName = project.name;
            
            // Get high priority tasks for this project
            const taskQuery = await knowledgeGraphManager.searchNodes(`entityType:task project:${projectName} priority:high status:active`);
            highPriorityTasks = [...highPriorityTasks, ...taskQuery.entities];
            
            // Get project health metrics
            try {
              const healthData = await knowledgeGraphManager.getProjectHealth(projectName);
              projectHealthData.push({
                project: projectName,
                health: healthData.overall.status,
                score: healthData.overall.score,
                issues: healthData.metrics.issueMetrics.count,
                risksCount: healthData.metrics.riskMetrics.count
              });
            } catch (error) {
              console.error(`Error getting health for ${projectName}:`, error);
            }
            
            // Get upcoming milestones
            try {
              const milestoneData = await knowledgeGraphManager.getMilestoneProgress(projectName);
              projectMilestones = [...projectMilestones, ...milestoneData.upcoming.map((m: any) => ({
                project: projectName,
                milestone: m.milestone.name,
                dueDate: m.dueDate,
                progress: m.progress
              }))];
            } catch (error) {
              console.error(`Error getting milestones for ${projectName}:`, error);
            }
            
            // Get project risks
            try {
              const riskData = await knowledgeGraphManager.getProjectRisks(projectName);
              projectRisks = [...projectRisks, ...riskData.risks
                .filter((r: any) => r.severity === "high")
                .map((r: any) => ({
                  project: projectName,
                  risk: r.risk.name,
                  severity: r.severity,
                  likelihood: r.likelihood,
                  impact: r.impact
                }))
              ];
            } catch (error) {
              console.error(`Error getting risks for ${projectName}:`, error);
            }
          }
          
          // Prepare display text for the context
          const projectsText = projects.map(p => {
            const status = p.observations.find(o => o.startsWith("status:"))?.substring(7) || "Unknown";
            const deadline = p.observations.find(o => o.startsWith("deadline:"))?.substring(9) || "No deadline";
            return `- **${p.name}** (${status}): Due ${deadline}`;
          }).join("\n");
          
          const tasksText = highPriorityTasks.slice(0, 10).map(t => {
            const status = t.observations.find(o => o.startsWith("status:"))?.substring(7) || "Unknown";
            const assignee = t.observations.find(o => o.startsWith("assignee:"))?.substring(9) || "Unassigned";
            const project = t.observations.find(o => o.startsWith("project:"))?.substring(8) || "Unknown project";
            return `- **${t.name}** (${project}, ${status}, Assignee: ${assignee})`;
          }).join("\n");
          
          const milestonesText = projectMilestones.slice(0, 8).map(m => 
            `- **${m.milestone}** (${m.project}): Due on ${m.dueDate}, ${m.progress}% complete`
          ).join("\n");
          
          const risksText = projectRisks.slice(0, 5).map(r => 
            `- **${r.risk}** (${r.project}): Severity: ${r.severity}, Impact: ${r.impact}`
          ).join("\n");
          
          const healthText = projectHealthData.map(h =>
            `- **${h.project}**: Health: ${h.health} (Score: ${h.score}/100), Issues: ${h.issues}, Risks: ${h.risksCount}`
          ).join("\n");
          
          const date = new Date().toISOString().split('T')[0];
          
          const sessionsText = recentSessions.map(s => {
            return `- ${s.date}: ${s.project} - ${s.summary.substring(0, 100)}${s.summary.length > 100 ? '...' : ''}`;
          }).join("\n");
          
          return {
            content: [{
              type: "text",
              text: `# Ask user to choose what to focus on in this session. Present the following options:

## Recent Project Management Sessions
${sessionsText || "No recent sessions found."}

## Active Projects
${projectsText || "No active projects found."}

## High-Priority Tasks
${tasksText || "No high-priority tasks found."}

## Upcoming Milestones
${milestonesText || "No upcoming milestones found."}

## Project Health Summary
${healthText || "No project health data available."}

## Top Project Risks
${risksText || "No high severity risks identified."}

To load specific project context, use the \`loadcontext\` tool with the project name and session ID - ${sessionId}`
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

    /**
     * Load context for a specific entity
     */
    server.tool(
      "loadcontext",
      toolDescriptions["loadcontext"],
      {
        entityName: z.string(),
        entityType: z.string().optional(),
        sessionId: z.string().optional() // Optional to maintain backward compatibility
      },
      async ({ entityName, entityType = "project", sessionId }) => {
        try {
          // Validate session if ID is provided
          if (sessionId) {
            const sessionStates = await loadSessionStates();
            if (!sessionStates.has(sessionId)) {
              console.warn(`Warning: Session ${sessionId} not found, but proceeding with context load`);
              // Initialize it anyway for more robustness
              sessionStates.set(sessionId, []);
              await saveSessionStates(sessionStates);
            }
            
            // Track that this entity was loaded in this session
            const sessionState = sessionStates.get(sessionId) || [];
            const loadEvent = {
              type: 'context_loaded',
              timestamp: new Date().toISOString(),
              entityName,
              entityType
            };
            sessionState.push(loadEvent);
            sessionStates.set(sessionId, sessionState);
            await saveSessionStates(sessionStates);
          }
          
          // Get the entity
          // Changed from using 'name:' prefix to directly searching by the entity name
          const entityGraph = await knowledgeGraphManager.searchNodes(entityName);
          if (entityGraph.entities.length === 0) {
            throw new Error(`Entity ${entityName} not found`);
          }
          
          // Find the exact entity by name (case-sensitive match)
          const entity = entityGraph.entities.find(e => e.name === entityName);
          if (!entity) {
            throw new Error(`Entity ${entityName} not found`);
          }
          
          // Different context loading based on entity type
          let contextMessage = "";
          
          if (entityType === "project") {
            // Get project overview
            const projectOverview = await knowledgeGraphManager.getProjectOverview(entityName);
            
            // Format project context message
            const description = projectOverview.info.description || "No description available";
            const startDate = projectOverview.info.startDate || "Not specified";
            const endDate = projectOverview.info.endDate || "Not specified";
            const status = projectOverview.info.status || "planning";
            const priority = projectOverview.info.priority || "medium";
            const goal = projectOverview.info.goal || "Not specified";
            const budget = projectOverview.info.budget || "Not specified";
            
            // Format tasks
            const tasksText = projectOverview.tasks?.map((task: Entity) => {
              const taskStatus = task.observations.find(o => o.startsWith('Status:'))?.split(':', 2)[1]?.trim() || 'not_started';
              const dueDate = task.observations.find(o => o.startsWith('DueDate:'))?.split(':', 2)[1]?.trim() || 'Not set';
              const description = task.observations.find(o => !o.startsWith('Status:') && !o.startsWith('DueDate:') && !o.startsWith('Priority:'));
              return `- **${task.name}** (Status: ${taskStatus}, Due: ${dueDate}): ${description || "No description"}`;
            }).join("\n") || "No tasks found";
            
            // Format milestones
            const milestonesText = projectOverview.milestones?.map((milestone: Entity) => {
              const status = milestone.observations.find(o => o.startsWith('Status:'))?.split(':', 2)[1]?.trim() || 'planned';
              const date = milestone.observations.find(o => o.startsWith('Date:'))?.split(':', 2)[1]?.trim() || 'Not set';
              const description = milestone.observations.find(o => !o.startsWith('Status:') && !o.startsWith('Date:'));
              return `- **${milestone.name}** (Status: ${status}, Date: ${date}): ${description || "No description"}`;
            }).join("\n") || "No milestones found";
            
            // Format issues
            const issuesText = projectOverview.issues?.map((issue: Entity) => {
              const status = issue.observations.find(o => o.startsWith('Status:'))?.split(':', 2)[1]?.trim() || 'identified';
              const priority = issue.observations.find(o => o.startsWith('Priority:'))?.split(':', 2)[1]?.trim() || 'medium';
              const description = issue.observations.find(o => !o.startsWith('Status:') && !o.startsWith('Priority:'));
              return `- **${issue.name}** (Status: ${status}, Priority: ${priority}): ${description || "No description"}`;
            }).join("\n") || "No issues found";
            
            // Format team members
            const teamMembersText = projectOverview.teamMembers?.map((member: Entity) => {
              const role = member.observations.find(o => o.startsWith('Role:'))?.split(':', 2)[1]?.trim() || 'Not specified';
              return `- **${member.name}** (Role: ${role})`;
            }).join("\n") || "No team members found";
            
            // Format risks
            const risksText = projectOverview.risks?.map((risk: Entity) => {
              const status = risk.observations.find(o => o.startsWith('Status:'))?.split(':', 2)[1]?.trim() || 'identified';
              const description = risk.observations.find(o => !o.startsWith('Status:') && !o.startsWith('Likelihood:') && !o.startsWith('Impact:'));
              return `- **${risk.name}** (Status: ${status}): ${description || "No description"}`;
            }).join("\n") || "No risks found";
            
            contextMessage = `# Project Context: ${entityName}

## Project Details
- **Description**: ${description}
- **Status**: ${status}
- **Priority**: ${priority}
- **Timeline**: ${startDate} to ${endDate}
- **Goal**: ${goal}
- **Budget**: ${budget}
- **Progress**: ${projectOverview.summary.taskCompletionRate || 0}% of tasks completed

## Tasks (${projectOverview.summary.completedTasks || 0}/${projectOverview.summary.taskCount || 0} completed)
${tasksText}

## Milestones
${milestonesText}

## Issues
${issuesText}

## Team Members
${teamMembersText}

## Risks
${risksText}`;
          } 
          else if (entityType === "task") {
            // Get task dependencies and information
            const taskDependencies = await knowledgeGraphManager.getTaskDependencies(entityName);
            
            // Get project name
            const projectName = taskDependencies.projectName || "Unknown project";
            
            // Format task context
            const task = taskDependencies.task;
            const status = task.observations.find((o: string) => o.startsWith('Status:'))?.split(':', 2)[1]?.trim() || 'not_started';
            const dueDate = task.observations.find((o: string) => o.startsWith('DueDate:'))?.split(':', 2)[1]?.trim() || 'Not set';
            const priority = task.observations.find((o: string) => o.startsWith('Priority:'))?.split(':', 2)[1]?.trim() || 'medium';
            const description = task.observations.find((o: string) => !o.startsWith('Status:') && !o.startsWith('DueDate:') && !o.startsWith('Priority:'));
            
            // Get assignee if available
            let assigneeText = "No assignee";
            for (const relation of entityGraph.relations) {
              if (relation.relationType === 'assigned_to' && relation.from === entityName) {
                const teamMember = entityGraph.entities.find(e => e.name === relation.to && e.entityType === 'teamMember');
                if (teamMember) {
                  assigneeText = teamMember.name;
                  break;
                }
              }
            }
            
            // Format dependencies
            const dependsOnText = taskDependencies.dependencies
              .filter((dep: any) => dep.task.name !== entityName && dep.dependsOn.includes(entityName))
              .map((dep: any) => {
                return `- **${dep.task.name}** (Status: ${dep.status}): This task depends on ${entityName}`;
              }).join("\n") || "No tasks depend on this task";
            
            const dependedOnByText = taskDependencies.dependencies
              .filter((dep: any) => dep.task.name !== entityName && dep.dependedOnBy.includes(entityName))
              .map((dep: any) => {
                return `- **${dep.task.name}** (Status: ${dep.status}): ${entityName} depends on this task`;
              }).join("\n") || "This task doesn't depend on other tasks";
            
            // Determine if task is on critical path
            const onCriticalPath = taskDependencies.criticalPath?.includes(entityName);
            const criticalPathText = onCriticalPath ? 
              "⚠️ This task is on the critical path. Delays will impact the project timeline." : 
              "This task is not on the critical path.";
            
            contextMessage = `# Task Context: ${entityName}

## Task Details
- **Project**: ${projectName}
- **Status**: ${status}
- **Due Date**: ${dueDate}
- **Priority**: ${priority}
- **Assignee**: ${assigneeText}
- **Description**: ${description || "No description available"}
- **Critical Path**: ${criticalPathText}

## Tasks That Depend On This Task
${dependsOnText}

## Tasks This Task Depends On
${dependedOnByText}`;
          }
          else if (entityType === "milestone") {
            // Get milestone progress
            const projectName = entity.observations.find(o => o.startsWith('Project:'))?.split(':', 2)[1]?.trim();
            
            if (!projectName) {
              throw new Error(`Project not found for milestone ${entityName}`);
            }
            
            const milestoneProgress = await knowledgeGraphManager.getMilestoneProgress(projectName, entityName);
            
            if (!milestoneProgress || !milestoneProgress.milestones || milestoneProgress.milestones.length === 0) {
              throw new Error(`Milestone progress data not available for ${entityName}`);
            }
            
            // Find this milestone
            const milestone = milestoneProgress.milestones.find((m: any) => m.milestone.name === entityName);
            
            if (!milestone) {
              throw new Error(`Milestone ${entityName} not found in progress data`);
            }
            
            // Format milestone context
            const description = milestone.info.description || "No description available";
            const date = milestone.info.date || "Not set";
            const status = milestone.info.status || "planned";
            const criteria = milestone.info.criteria || "Not specified";
            
            // Format tasks required for this milestone
            const tasksText = milestone.relatedTasks?.map((task: Entity) => {
              const taskStatus = task.observations.find(o => o.startsWith('Status:'))?.split(':', 2)[1]?.trim() || 'not_started';
              return `- **${task.name}** (Status: ${taskStatus})`;
            }).join("\n") || "No tasks found";
            
            // Format blockers
            const blockersText = milestone.blockers?.map((task: Entity) => {
              const taskStatus = task.observations.find(o => o.startsWith('Status:'))?.split(':', 2)[1]?.trim() || 'not_started';
              return `- **${task.name}** (Status: ${taskStatus})`;
            }).join("\n") || "No blocking tasks";
            
            contextMessage = `# Milestone Context: ${entityName}

## Milestone Details
- **Project**: ${projectName}
- **Status**: ${status}
- **Date**: ${date}
- **Completion Criteria**: ${criteria}
- **Description**: ${description}
- **Progress**: ${milestone.progress.completionPercentage || 0}% complete
- **Days Remaining**: ${milestone.progress.daysRemaining !== null ? milestone.progress.daysRemaining : 'Unknown'}
- **Overdue**: ${milestone.progress.isOverdue ? 'Yes' : 'No'}

## Required Tasks (${milestone.progress.completedTasks || 0}/${milestone.progress.totalTasks || 0} completed)
${tasksText}

## Blocking Tasks
${blockersText}`;
          }
          else if (entityType === "teamMember") {
            // Get team member assignments
            const teamMemberAssignments = await knowledgeGraphManager.getTeamMemberAssignments(entityName);
            
            // Format team member context
            const role = teamMemberAssignments.info.role || "Not specified";
            const skills = teamMemberAssignments.info.skills || "Not specified";
            const availability = teamMemberAssignments.info.availability || "Not specified";
            
            // Format assigned tasks
            const tasksText = teamMemberAssignments.assignedTasks?.map((assignment: any) => {
              return `- **${assignment.task.name}** (Project: ${assignment.project?.name || 'Unassigned'}, Status: ${assignment.status}, Due: ${assignment.dueDate || 'Not set'})`;
            }).join("\n") || "No tasks assigned";
            
            // Format projects
            const projectsText = teamMemberAssignments.projects?.map((project: Entity) => {
              return `- **${project.name}**`;
            }).join("\n") || "Not assigned to any projects";
            
            // Format deadlines
            const deadlinesText = teamMemberAssignments.upcomingDeadlines?.map((assignment: any) => {
              return `- **${assignment.task.name}** (Due: ${assignment.dueDate})`;
            }).join("\n") || "No upcoming deadlines";
            
            // Format overdue tasks
            const overdueText = teamMemberAssignments.overdueTasks?.map((assignment: any) => {
              return `- **${assignment.task.name}** (Due: ${assignment.dueDate})`;
            }).join("\n") || "No overdue tasks";
            
            contextMessage = `# Team Member Context: ${entityName}

## Team Member Details
- **Role**: ${role}
- **Skills**: ${skills}
- **Availability**: ${availability}
- **Workload**: ${teamMemberAssignments.assignedTasks.length} tasks assigned (${teamMemberAssignments.workload.completionRate}% completed)

## Assigned Tasks
${tasksText}

## Projects
${projectsText}

## Upcoming Deadlines
${deadlinesText}

## Overdue Tasks
${overdueText}`;
          }
          else if (entityType === "resource") {
            // Find which project this resource belongs to
            let projectName = 'Unknown project';
            
            for (const relation of entityGraph.relations) {
              if (relation.relationType === 'part_of' && relation.from === entityName) {
                const project = entityGraph.entities.find(e => e.name === relation.to && e.entityType === 'project');
                if (project) {
                  projectName = project.name;
                  break;
                }
              }
            }
            
            // Get resource allocation
            const resourceAllocation = await knowledgeGraphManager.getResourceAllocation(projectName, entityName);
            
            if (!resourceAllocation || !resourceAllocation.resources || resourceAllocation.resources.length === 0) {
              throw new Error(`Resource allocation data not available for ${entityName}`);
            }
            
            // Find this resource
            const resource = resourceAllocation.resources.find((r: any) => r.resource.name === entityName);
            
            if (!resource) {
              throw new Error(`Resource ${entityName} not found in allocation data`);
            }
            
            // Format resource context
            const type = resource.info.type || "Not specified";
            const availability = resource.info.availability || "Not specified";
            const capacity = resource.info.capacity || "Not specified";
            const cost = resource.info.cost || "Not specified";
            
            // Format assigned tasks
            const tasksText = resource.assignedTasks?.map((task: Entity) => {
              const status = task.observations.find(o => o.startsWith('Status:'))?.split(':', 2)[1]?.trim() || 'not_started';
              return `- **${task.name}** (Status: ${status})`;
            }).join("\n") || "No tasks assigned";
            
            // Format team members using this resource
            const teamMembersText = resource.teamMembers?.map((member: Entity) => {
              return `- **${member.name}**`;
            }).join("\n") || "No team members assigned";
            
            contextMessage = `# Resource Context: ${entityName}

## Resource Details
- **Type**: ${type}
- **Project**: ${projectName}
- **Availability**: ${availability}
- **Capacity**: ${capacity}
- **Cost**: ${cost}
- **Usage**: ${resource.usage.usagePercentage}% (${resource.usage.inProgressTasks} tasks in progress)

## Assigned Tasks
${tasksText}

## Team Members Using This Resource
${teamMembersText}`;
          }
          else {
            // Generic entity context for other entity types
            // Find all relations involving this entity
            const relations = await knowledgeGraphManager.openNodes([entityName]);
            
            // Build a text representation of related entities
            const incomingRelations = relations.relations.filter(r => r.to === entityName);
            const outgoingRelations = relations.relations.filter(r => r.from === entityName);
            
            const incomingText = incomingRelations.map(rel => {
              const sourceEntity = relations.entities.find(e => e.name === rel.from);
              if (!sourceEntity) return null;
              return `- **${sourceEntity.name}** (${sourceEntity.entityType}) → ${rel.relationType} → ${entityName}`;
            }).filter(Boolean).join("\n") || "No incoming relations";
            
            const outgoingText = outgoingRelations.map(rel => {
              const targetEntity = relations.entities.find(e => e.name === rel.to);
              if (!targetEntity) return null;
              return `- **${entityName}** → ${rel.relationType} → **${targetEntity.name}** (${targetEntity.entityType})`;
            }).filter(Boolean).join("\n") || "No outgoing relations";
            
            // Format observations
            const observationsText = entity.observations.map((obs: string) => `- ${obs}`).join("\n") || "No observations";
            
            contextMessage = `# Entity Context: ${entityName} (${entityType})

## Observations
${observationsText}

## Incoming Relations
${incomingText}

## Outgoing Relations
${outgoingText}`;
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

    // Helper function to process each stage of endsession
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
              project: ""
            },
            completed: !params.nextStageNeeded
          };
          
        case "achievements":
          // Process achievements stage
          return {
            stage: "achievements",
            stageNumber: params.stageNumber,
            analysis: params.analysis || "",
            stageData: params.stageData || { achievements: [] },
            completed: !params.nextStageNeeded
          };
          
        case "taskUpdates":
          // Process task updates stage
          return {
            stage: "taskUpdates",
            stageNumber: params.stageNumber,
            analysis: params.analysis || "",
            stageData: params.stageData || { updates: [] },
            completed: !params.nextStageNeeded
          };
          
        case "newTasks":
          // Process new tasks stage
          return {
            stage: "newTasks",
            stageNumber: params.stageNumber,
            analysis: params.analysis || "",
            stageData: params.stageData || { tasks: [] },
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
          
        case "riskUpdates":
          // Process risk updates stage
          return {
            stage: "riskUpdates",
            stageNumber: params.stageNumber,
            analysis: params.analysis || "",
            stageData: params.stageData || { risks: [] },
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

    // Helper function to assemble the final end-session arguments
    function assembleEndSessionArgs(stages: any[]): any {
      const summaryStage = stages.find(s => s.stage === "summary");
      const achievementsStage = stages.find(s => s.stage === "achievements");
      const taskUpdatesStage = stages.find(s => s.stage === "taskUpdates");
      const newTasksStage = stages.find(s => s.stage === "newTasks");
      const projectStatusStage = stages.find(s => s.stage === "projectStatus");
      const riskUpdatesStage = stages.find(s => s.stage === "riskUpdates");
      
      // Get current date
      const date = new Date().toISOString().split('T')[0];
      
      return {
        date,
        summary: summaryStage?.stageData?.summary || "",
        duration: summaryStage?.stageData?.duration || "unknown",
        project: summaryStage?.stageData?.project || "",
        achievements: JSON.stringify(achievementsStage?.stageData?.achievements || []),
        taskUpdates: JSON.stringify(taskUpdatesStage?.stageData?.updates || []),
        projectStatus: projectStatusStage?.stageData?.projectStatus || "",
        projectObservation: projectStatusStage?.stageData?.projectObservation || "",
        newTasks: JSON.stringify(newTasksStage?.stageData?.tasks || []),
        riskUpdates: JSON.stringify(riskUpdatesStage?.stageData?.risks || [])
      };
    }

    /**
     * End session by processing all stages and recording the final results.
     * Only use this tool if the user asks for it.
     * 
     * Usage examples:
     * 
     * 1. Starting the end session process with the summary stage:
     * {
     *   "sessionId": "proj_1234567890_abc123",  // From startsession
     *   "stage": "summary",
     *   "stageNumber": 1,
     *   "totalStages": 6, 
     *   "analysis": "Analyzed progress on the marketing campaign project",
     *   "stageData": {
     *     "summary": "Completed the social media strategy components",
     *     "duration": "4 hours",
     *     "project": "Q4 Marketing Campaign"  // Project name
     *   },
     *   "nextStageNeeded": true,  // More stages coming
     *   "isRevision": false
     * }
     * 
     * 2. Middle stage for milestones:
     * {
     *   "sessionId": "proj_1234567890_abc123",
     *   "stage": "milestones",
     *   "stageNumber": 2,
     *   "totalStages": 6,
     *   "analysis": "Updated milestone progress",
     *   "stageData": {
     *     "milestones": [
     *       { "name": "Content Creation", "status": "completed", "notes": "All blog posts and social media content finished" },
     *       { "name": "Channel Selection", "status": "in_progress", "notes": "Evaluating performance of different platforms" }
     *     ]
     *   },
     *   "nextStageNeeded": true,
     *   "isRevision": false
     * }
     * 
     * 3. Final assembly stage:
     * {
     *   "sessionId": "proj_1234567890_abc123",
     *   "stage": "assembly",
     *   "stageNumber": 6,
     *   "totalStages": 6,
     *   "nextStageNeeded": false,  // This completes the session
     *   "isRevision": false
     * }
     */
    server.tool(
      "endsession",
      toolDescriptions["endsession"],
      {
        sessionId: z.string().describe("The unique session identifier obtained from startsession"),
        stage: z.string().describe("Current stage of analysis: 'summary', 'milestones', 'risks', 'tasks', 'teamUpdates', or 'assembly'"),
        stageNumber: z.number().int().positive().describe("The sequence number of the current stage (starts at 1)"),
        totalStages: z.number().int().positive().describe("Total number of stages in the workflow (typically 6 for standard workflow)"),
        analysis: z.string().optional().describe("Text analysis or observations for the current stage"),
        stageData: z.any().optional().describe(`Stage-specific data structure - format depends on the stage type:
        - For 'summary' stage: { summary: "Session summary text", duration: "4 hours", project: "Project Name" }
        - For 'milestones' stage: { milestones: [{ name: "Milestone1", status: "completed", notes: "Notes about completion" }] }
        - For 'risks' stage: { risks: [{ name: "Risk1", severity: "high", mitigation: "Plan to address this risk" }] }
        - For 'tasks' stage: { tasks: [{ name: "Task1", status: "in_progress", assignee: "Team Member", notes: "Status update" }] }
        - For 'teamUpdates' stage: { teamUpdates: [{ member: "Team Member", status: "Completed assigned tasks", blockers: "None" }] }
        - For 'assembly' stage: no stageData needed - automatic assembly of previous stages`),
        nextStageNeeded: z.boolean().describe("Whether additional stages are needed after this one (false for final stage)"),
        isRevision: z.boolean().optional().describe("Whether this is revising a previous stage"),
        revisesStage: z.number().int().positive().optional().describe("If revising, which stage number is being revised")
      },
      async (params) => {
        try {
          // Load session states from persistent storage
          const sessionStates = await loadSessionStates();
          
          // Validate session ID
          if (!sessionStates.has(params.sessionId)) {
            return {
              content: [{
                type: "text",
                text: JSON.stringify({ 
                  success: false,
                  error: `Session with ID ${params.sessionId} not found. Please start a new session with startsession.`
                }, null, 2)
              }]
            };
          }
          
          // Get or initialize session state
          let sessionState = sessionStates.get(params.sessionId) || [];
          
          // Process the current stage
          const stageResult = await processStage(params, sessionState);
          
          // Store updated state
          if (params.isRevision && params.revisesStage) {
            // Find the analysis stages in the session state
            const analysisStages = sessionState.filter(item => item.type === 'analysis_stage') || [];
            
            if (params.revisesStage <= analysisStages.length) {
              // Replace the revised stage
              analysisStages[params.revisesStage - 1] = {
                type: 'analysis_stage',
                ...stageResult
              };
            } else {
              // Add as a new stage
              analysisStages.push({
                type: 'analysis_stage',
                ...stageResult
              });
            }
            
            // Update the session state with the modified analysis stages
            sessionState = [
              ...sessionState.filter(item => item.type !== 'analysis_stage'),
              ...analysisStages
            ];
          } else {
            // Add new stage
            sessionState.push({
              type: 'analysis_stage',
              ...stageResult
            });
          }
          
          // Update in persistent storage
          sessionStates.set(params.sessionId, sessionState);
          await saveSessionStates(sessionStates);
          
          // Check if this is the final assembly stage and no more stages are needed
          if (params.stage === "assembly" && !params.nextStageNeeded) {
            // Get the assembled arguments
            const args = stageResult.stageData;
            
            try {
              // Parse arguments
              const date = args.date;
              const summary = args.summary;
              const duration = args.duration;
              const project = args.project;
              const achievements = args.achievements ? JSON.parse(args.achievements) : [];
              const taskUpdates = args.taskUpdates ? JSON.parse(args.taskUpdates) : [];
              const projectStatus = args.projectStatus;
              const projectObservation = args.projectObservation;
              const newTasks = args.newTasks ? JSON.parse(args.newTasks) : [];
              const riskUpdates = args.riskUpdates ? JSON.parse(args.riskUpdates) : [];
              
              // No longer create session entity since we use persistent storage
              
              // Record session completion in persistent storage
              sessionState.push({
                type: 'session_completed',
                timestamp: new Date().toISOString(),
                date: date,
                summary: summary,
                project: project
              });
              
              sessionStates.set(params.sessionId, sessionState);
              await saveSessionStates(sessionStates);
              
              // Prepare the summary message
              const summaryMessage = `# Project Session Recorded

I've recorded your project session from ${date} focusing on ${project}.

## Decisions Documented
${achievements.map((a: string) => `- ${a}`).join('\n') || "No decisions recorded."}

## Task Updates
${taskUpdates.map((t: {name: string, status: string, progress?: string}) => 
  `- ${t.name}: ${t.status}${t.progress ? ` (Progress: ${t.progress})` : ''}`
).join('\n') || "No task updates."}

## Project Status
Project ${project} has been updated to: ${projectStatus}

${newTasks && newTasks.length > 0 ? `## New Tasks Added
${newTasks.map((t: {name: string, description: string, priority: string}) => 
  `- ${t.name}: ${t.description} (Priority: ${t.priority || "medium"})`
).join('\n')}` : "No new tasks added."}

${riskUpdates && riskUpdates.length > 0 ? `## Risk Updates
${riskUpdates.map((r: {name: string, status: string, impact: string, probability: string}) => 
  `- ${r.name}: Status ${r.status} (Impact: ${r.impact}, Probability: ${r.probability})`
).join('\n')}` : "No risk updates."}

## Session Summary
${summary}

Would you like me to perform any additional updates to your project knowledge graph?`;
              
              // Return the final result with the session recorded message
              return {
                content: [{
                  type: "text",
                  text: JSON.stringify({
                    success: true,
                    stageCompleted: params.stage,
                    nextStageNeeded: false,
                    stageResult: stageResult,
                    sessionRecorded: true,
                    summaryMessage: summaryMessage
                  }, null, 2)
                }]
              };
            } catch (error) {
              return {
                content: [{
                  type: "text",
                  text: JSON.stringify({
                    success: false,
                    error: `Error recording project session: ${error instanceof Error ? error.message : String(error)}`
                  }, null, 2)
                }]
              };
            }
          } else {
            // This is not the final stage or more stages are needed
            // Return intermediate result
            return {
              content: [{
                type: "text",
                text: JSON.stringify({
                  success: true,
                  stageCompleted: params.stage,
                  nextStageNeeded: params.nextStageNeeded,
                  stageResult: stageResult,
                  endSessionArgs: params.stage === "assembly" ? stageResult.stageData : null
                }, null, 2)
              }]
            };
          }
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

    

    /**
     * Create entities, relations, and observations.
     */
    server.tool(
      "buildcontext",
      toolDescriptions["buildcontext"],
      {
        type: z.enum(["entities", "relations", "observations"]).describe("Type of creation operation: 'entities', 'relations', or 'observations'"),
        data: z.array(z.any()).describe("Data for the creation operation, structure varies by type but must be an array")
      },
      async ({ type, data }) => {
        try {
          let result;
          
          switch (type) {
            case "entities":
              // Ensure entities match the Entity interface
              const typedEntities: Entity[] = data.map((e: any) => ({
                name: e.name,
                entityType: e.entityType,
                observations: e.observations,
                embedding: e.embedding
              }));
              result = await knowledgeGraphManager.createEntities(typedEntities);
              return {
                content: [{
                  type: "text",
                  text: JSON.stringify({ success: true, created: result }, null, 2)
                }]
              };
              
            case "relations":
              // Ensure relations match the Relation interface
              const typedRelations: Relation[] = data.map((r: any) => ({
                from: r.from,
                to: r.to,
                relationType: r.relationType,
                observations: r.observations
              }));
              result = await knowledgeGraphManager.createRelations(typedRelations);
              return {
                content: [{
                  type: "text",
                  text: JSON.stringify({ success: true, created: result }, null, 2)
                }]
              };
              
            case "observations":
              // For project domain, addObservations takes entity name and observations
              for (const item of data) {
                if (item.entityName && Array.isArray(item.contents)) {
                  await knowledgeGraphManager.addObservations(item.entityName, item.contents);
                }
              }
              return {
                content: [{
                  type: "text",
                  text: JSON.stringify({ success: true, message: "Added observations to entities" }, null, 2)
                }]
              };
              
            default:
              throw new Error(`Invalid type: ${type}. Must be 'entities', 'relations', or 'observations'.`);
          }
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
    
    /**
     * Delete entities, relations, and observations.
     */
    server.tool(
      "deletecontext",
      toolDescriptions["deletecontext"],
      {
        type: z.enum(["entities", "relations", "observations"]).describe("Type of deletion operation: 'entities', 'relations', or 'observations'"),
        data: z.array(z.any()).describe("Data for the deletion operation, structure varies by type but must be an array")
      },
      async ({ type, data }) => {
        try {
          switch (type) {
            case "entities":
              await knowledgeGraphManager.deleteEntities(data);
              return {
                content: [{
                  type: "text",
                  text: JSON.stringify({ success: true, message: `Deleted ${data.length} entities` }, null, 2)
                }]
              };
              
            case "relations":
              // Ensure relations match the Relation interface
              const typedRelations: Relation[] = data.map((r: any) => ({
                from: r.from,
                to: r.to,
                relationType: r.relationType
              }));
              await knowledgeGraphManager.deleteRelations(typedRelations);
              return {
                content: [{
                  type: "text",
                  text: JSON.stringify({ success: true, message: `Deleted ${data.length} relations` }, null, 2)
                }]
              };
              
            case "observations":
              // Ensure deletions match the required interface
              const typedDeletions: { entityName: string; observations: string[] }[] = data.map((d: any) => ({
                entityName: d.entityName,
                observations: d.observations
              }));
              await knowledgeGraphManager.deleteObservations(typedDeletions);
              return {
                content: [{
                  type: "text",
                  text: JSON.stringify({ success: true, message: `Deleted observations from ${data.length} entities` }, null, 2)
                }]
              };
              
            default:
              throw new Error(`Invalid type: ${type}. Must be 'entities', 'relations', or 'observations'.`);
          }
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
    
    /**
     * Read the graph, search nodes, open nodes, get project overview, get task dependencies, get team member assignments, get milestone progress, get project timeline, get resource allocation, get project risks, find related projects, get decision log, and get project health.
     */
    server.tool(
      "advancedcontext",
      toolDescriptions["advancedcontext"],
      {
        type: z.enum([
          "graph", 
          "search", 
          "nodes", 
          "project", 
          "dependencies", 
          "assignments", 
          "milestones", 
          "timeline", 
          "resources", 
          "risks", 
          "related", 
          "decisions", 
          "health"
        ]).describe("Type of get operation"),
        params: z.any().describe("Parameters for the get operation, structure varies by type")
      },
      async ({ type, params }) => {
        try {
          let result;
          
          switch (type) {
            case "graph":
              result = await knowledgeGraphManager.readGraph();
              return {
                content: [{
                  type: "text",
                  text: JSON.stringify({ success: true, graph: result }, null, 2)
                }]
              };
              
            case "search":
              result = await knowledgeGraphManager.searchNodes(params.query);
              return {
                content: [{
                  type: "text",
                  text: JSON.stringify({ success: true, results: result }, null, 2)
                }]
              };
              
            case "nodes":
              result = await knowledgeGraphManager.openNodes(params.names);
              return {
                content: [{
                  type: "text",
                  text: JSON.stringify({ success: true, nodes: result }, null, 2)
                }]
              };
              
            case "project":
              result = await knowledgeGraphManager.getProjectOverview(params.projectName);
              return {
                content: [{
                  type: "text",
                  text: JSON.stringify({ success: true, project: result }, null, 2)
                }]
              };
              
            case "dependencies":
              result = await knowledgeGraphManager.getTaskDependencies(
                params.taskName,
                params.depth || 2
              );
              return {
                content: [{
                  type: "text",
                  text: JSON.stringify({ success: true, dependencies: result }, null, 2)
                }]
              };
              
            case "assignments":
              result = await knowledgeGraphManager.getTeamMemberAssignments(params.teamMemberName);
              return {
                content: [{
                  type: "text",
                  text: JSON.stringify({ success: true, assignments: result }, null, 2)
                }]
              };
              
            case "milestones":
              result = await knowledgeGraphManager.getMilestoneProgress(
                params.projectName,
                params.milestoneName
              );
              return {
                content: [{
                  type: "text",
                  text: JSON.stringify({ success: true, milestones: result }, null, 2)
                }]
              };
              
            case "timeline":
              result = await knowledgeGraphManager.getProjectTimeline(params.projectName);
              return {
                content: [{
                  type: "text",
                  text: JSON.stringify({ success: true, timeline: result }, null, 2)
                }]
              };
              
            case "resources":
              result = await knowledgeGraphManager.getResourceAllocation(
                params.projectName,
                params.resourceName
              );
              return {
                content: [{
                  type: "text",
                  text: JSON.stringify({ success: true, resources: result }, null, 2)
                }]
              };
              
            case "risks":
              result = await knowledgeGraphManager.getProjectRisks(params.projectName);
              return {
                content: [{
                  type: "text",
                  text: JSON.stringify({ success: true, risks: result }, null, 2)
                }]
              };
              
            case "related":
              result = await knowledgeGraphManager.findRelatedProjects(
                params.projectName,
                params.depth || 1
              );
              return {
                content: [{
                  type: "text",
                  text: JSON.stringify({ success: true, relatedProjects: result }, null, 2)
                }]
              };
              
            case "decisions":
              result = await knowledgeGraphManager.getDecisionLog(params.projectName);
              return {
                content: [{
                  type: "text",
                  text: JSON.stringify({ success: true, decisions: result }, null, 2)
                }]
              };
              
            case "health":
              result = await knowledgeGraphManager.getProjectHealth(params.projectName);
              return {
                content: [{
                  type: "text",
                  text: JSON.stringify({ success: true, health: result }, null, 2)
                }]
              };
              
            default:
              throw new Error(`Invalid type: ${type}. Must be one of the supported get operation types.`);
          }
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

    // Connect the server to the transport
    const transport = new StdioServerTransport();
    await server.connect(transport);
  } catch (error) {
    console.error("Error starting server:", error);
    process.exit(1);
  }
}

// Start the server
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
}); 

// Export the KnowledgeGraphManager class for testing
export { KnowledgeGraphManager }; 