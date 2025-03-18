#!/usr/bin/env node
declare const validEntityTypes: readonly ["course", "assignment", "exam", "concept", "resource", "note", "lecture", "project", "question", "term", "goal", "professor"];
type EntityType = typeof validEntityTypes[number];
interface Entity {
    name: string;
    entityType: EntityType;
    observations: string[];
    embedding?: any;
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
declare class KnowledgeGraphManager {
    private loadGraph;
    private saveGraph;
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
    getCourseOverview(courseName: string): Promise<any>;
    getUpcomingDeadlines(termName?: string, courseName?: string, daysAhead?: number): Promise<any>;
    getAssignmentStatus(assignmentName: string): Promise<any>;
    getExamPrep(examName: string): Promise<any>;
    findRelatedConcepts(conceptName: string, depth?: number): Promise<any>;
    trackLectureNotes(courseName: string): Promise<any>;
    getTermOverview(termName: string): Promise<any>;
}
export { KnowledgeGraphManager };
