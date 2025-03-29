#!/usr/bin/env node
declare const validEntityTypes: readonly ["project", "task", "milestone", "resource", "teamMember", "note", "document", "issue", "risk", "decision", "dependency", "component", "stakeholder", "change", "status", "priority"];
type EntityType = typeof validEntityTypes[number];
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
type Embedding = number[];
declare class KnowledgeGraphManager {
    loadGraph(): Promise<KnowledgeGraph>;
    private saveGraph;
    initializeStatusAndPriority(): Promise<void>;
    getEntityStatus(entityName: string): Promise<string | null>;
    getEntityPriority(entityName: string): Promise<string | null>;
    setEntityStatus(entityName: string, statusValue: string): Promise<void>;
    setEntityPriority(entityName: string, priorityValue: string): Promise<void>;
    createEntities(entities: Entity[]): Promise<KnowledgeGraph>;
    createRelations(relations: Relation[]): Promise<KnowledgeGraph>;
    addObservations(entityName: string, observations: string[]): Promise<KnowledgeGraph>;
    deleteEntities(entityNames: string[]): Promise<void>;
    deleteObservations(deletions: {
        entityName: string;
        observations: string[];
    }[]): Promise<void>;
    deleteRelations(relations: Relation[]): Promise<void>;
    readGraph(): Promise<KnowledgeGraph>;
    searchNodes(query: string): Promise<KnowledgeGraph>;
    openNodes(names: string[]): Promise<KnowledgeGraph>;
    getProjectOverview(projectName: string): Promise<any>;
    getTaskDependencies(taskName: string, depth?: number): Promise<any>;
    private getTaskAssignee;
    private calculateCriticalPath;
    getTeamMemberAssignments(teamMemberName: string): Promise<any>;
    getMilestoneProgress(projectName: string, milestoneName?: string): Promise<any>;
    getProjectTimeline(projectName: string): Promise<any>;
    getResourceAllocation(projectName: string, resourceName?: string): Promise<any>;
    getProjectRisks(projectName: string): Promise<any>;
    findRelatedProjects(projectName: string, depth?: number): Promise<any>;
    getDecisionLog(projectName: string): Promise<any>;
    getProjectHealth(projectName: string): Promise<any>;
    private generateHealthRecommendations;
}
export { KnowledgeGraphManager };
