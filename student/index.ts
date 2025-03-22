#!/usr/bin/env node
// Updated imports using the modern MCP SDK API
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// Node.js type declarations
import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { readFileSync, existsSync } from "fs";



// Define memory file path using environment variable with fallback
const parentPath = path.dirname(fileURLToPath(import.meta.url));
const defaultMemoryPath = path.join(parentPath, 'memory.json');
const defaultSessionsPath = path.join(parentPath, 'sessions.json');

// Properly handle absolute and relative paths for MEMORY_FILE_PATH
const MEMORY_FILE_PATH = process.env.MEMORY_FILE_PATH
  ? path.isAbsolute(process.env.MEMORY_FILE_PATH)
    ? process.env.MEMORY_FILE_PATH  // Use absolute path as is
    : path.join(process.cwd(), process.env.MEMORY_FILE_PATH)  // Relative to current working directory
  : defaultMemoryPath;  // Default fallback

// Properly handle absolute and relative paths for SESSIONS_FILE_PATH
const SESSIONS_FILE_PATH = process.env.SESSIONS_FILE_PATH
  ? path.isAbsolute(process.env.SESSIONS_FILE_PATH)
    ? process.env.SESSIONS_FILE_PATH  // Use absolute path as is
    : path.join(process.cwd(), process.env.SESSIONS_FILE_PATH)  // Relative to current working directory
  : defaultSessionsPath;  // Default fallback

// Student education specific entity types
const validEntityTypes = [
  'course',
  'assignment',
  'exam',
  'concept',
  'resource',
  'note',
  'lecture',
  'project',
  'question', 
  'term',
  'goal',
  'professor'
] as const;

// Type for entity types to ensure type safety
type EntityType = typeof validEntityTypes[number];

// Function to validate entity type
function isValidEntityType(type: string): type is EntityType {
  return (validEntityTypes as readonly string[]).includes(type);
}

// Explicit validation function for TypeScript
function validateEntityType(type: string): void {
  if (!isValidEntityType(type)) {
    throw new Error(`Invalid entity type: ${type}. Valid types are: ${validEntityTypes.join(', ')}`);
  }
}

// Student education specific relation types
const VALID_RELATION_TYPES = [
  'enrolled_in',     // Student is taking a course
  'assigned_in',     // Assignment is part of a course
  'due_on',          // Assignment/exam has specific due date
  'covers',          // Lecture/resource covers concept
  'references',      // Note references concept
  'prerequisite_for', // Concept is foundation for another
  'taught_by',       // Course taught by professor
  'scheduled_for',   // Lecture/exam scheduled for specific time
  'contains',        // Course contains lectures/assignments
  'requires',        // Assignment requires specific concepts
  'related_to',      // Concept related to another concept
  'created_for',     // Note created for specific lecture
  'studies',         // Study session focuses on concept/exam
  'helps_with',      // Resource helps with assignment/concept
  'submitted',       // Assignment submitted on date
  'part_of',         // Entity is part of another entity
  'included_in',     // Included in a larger component
  'follows',         // Entity follows another in sequence
  'attends',         // Student attends lecture
  'graded_with'      // Assignment/exam graded with specific criteria
];

// Status values for different entity types in student education
const STATUS_VALUES = {
  course: ['planned', 'current', 'completed', 'dropped', 'waitlisted'],
  assignment: ['not_started', 'in_progress', 'completed', 'submitted', 'graded'],
  exam: ['upcoming', 'studying', 'completed', 'graded'],
  project: ['planning', 'in_progress', 'reviewing', 'completed'],
  goal: ['active', 'completed', 'revised', 'dropped']
};

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
    `student_${tool}.txt`
  );
  if (existsSync(descriptionFilePath)) {
    toolDescriptions[tool] = readFileSync(descriptionFilePath, 'utf-8');
  }
}

// We are storing our memory using entities, relations, and observations in a graph structure
interface Entity {
  name: string;
  entityType: EntityType;
  observations: string[];
  embedding?: any; // Changed from Embedding to any to avoid import error
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

// The KnowledgeGraphManager class contains all operations to interact with the knowledge graph
class KnowledgeGraphManager {
  private async loadGraph(): Promise<KnowledgeGraph> {
    try {
      const fileContent = await fs.readFile(MEMORY_FILE_PATH, 'utf-8');
      return JSON.parse(fileContent);
    } catch (error) {
      // If the file doesn't exist, return an empty graph
      return {
        entities: [],
        relations: []
      };
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
    
    // Remove relations that involve the deleted entities
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
        // Remove the specified observations
        entity.observations = entity.observations.filter(
          o => !deletion.observations.includes(o)
        );
      }
    }
    
    await this.saveGraph(graph);
  }

  async deleteRelations(relations: Relation[]): Promise<void> {
    const graph = await this.loadGraph();
    
    // Remove specified relations
    graph.relations = graph.relations.filter(r => 
      !relations.some(toDelete => 
        r.from === toDelete.from && 
        r.to === toDelete.to && 
        r.relationType === toDelete.relationType
      )
    );
    
    await this.saveGraph(graph);
  }

  async readGraph(): Promise<KnowledgeGraph> {
    return this.loadGraph();
  }

  async searchNodes(query: string): Promise<KnowledgeGraph> {
    const graph = await this.loadGraph();
    
    // Split query into search terms
    const terms = query.toLowerCase().split(/\s+/);
    
    // Find matching entities
    const matchingEntityNames = new Set<string>();
    
    for (const entity of graph.entities) {
      // Check if all terms match
      const matchesAllTerms = terms.every(term => {
        // Check entity name
        if (entity.name.toLowerCase().includes(term)) {
          return true;
        }
        
        // Check entity type
        if (entity.entityType.toLowerCase().includes(term)) {
          return true;
        }
        
        // Check observations
        for (const observation of entity.observations) {
          if (observation.toLowerCase().includes(term)) {
            return true;
          }
        }
        
        return false;
      });
      
      if (matchesAllTerms) {
        matchingEntityNames.add(entity.name);
      }
    }
    
    // Find relations between matching entities
    const matchingRelations = graph.relations.filter(r => 
      matchingEntityNames.has(r.from) && matchingEntityNames.has(r.to)
    );
    
    // Return matching entities and their relations
    return {
      entities: graph.entities.filter(e => matchingEntityNames.has(e.name)),
      relations: matchingRelations
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

  // Get summary of course including lectures, assignments, exams, textbooks
  async getCourseOverview(courseName: string): Promise<any> {
    const graph = await this.loadGraph();
    
    // Find the course
    const course = graph.entities.find(e => e.name === courseName && e.entityType === 'course');
    if (!course) {
      throw new Error(`Course '${courseName}' not found`);
    }
    
    // Find term this course belongs to
    let term: Entity | undefined;
    for (const relation of graph.relations) {
      if (relation.relationType === 'part_of' && relation.from === courseName) {
        const potentialTerm = graph.entities.find(e => e.name === relation.to && e.entityType === 'term');
        if (potentialTerm) {
          term = potentialTerm;
          break;
        }
      }
    }
    
    // Find professor who teaches this course
    let professor: Entity | undefined;
    for (const relation of graph.relations) {
      if (relation.relationType === 'taught_by' && relation.from === courseName) {
        professor = graph.entities.find(e => e.name === relation.to && e.entityType === 'professor');
        if (professor) {
          break;
        }
      }
    }
    
    // Find lectures for this course
    const lectures: Entity[] = [];
    for (const relation of graph.relations) {
      if (relation.relationType === 'part_of' && relation.to === courseName) {
        const lecture = graph.entities.find(e => e.name === relation.from && e.entityType === 'lecture');
        if (lecture) {
          lectures.push(lecture);
        }
      }
    }
    
    // Sort lectures by date if available
    lectures.sort((a, b) => {
      const aDateObs = a.observations.find(o => o.startsWith('Date:'));
      const bDateObs = b.observations.find(o => o.startsWith('Date:'));
      
      if (aDateObs && bDateObs) {
        const aDate = new Date(aDateObs.split(':')[1].trim());
        const bDate = new Date(bDateObs.split(':')[1].trim());
        return aDate.getTime() - bDate.getTime();
      }
      return 0;
    });
    
    // Find assignments for this course
    const assignments: Entity[] = [];
    for (const relation of graph.relations) {
      if (relation.relationType === 'assigned_in' && relation.to === courseName) {
        const assignment = graph.entities.find(e => e.name === relation.from && e.entityType === 'assignment');
        if (assignment) {
          assignments.push(assignment);
        }
      }
    }
    
    // Sort assignments by due date if available
    assignments.sort((a, b) => {
      const aDueDateObs = a.observations.find(o => o.startsWith('Due:'));
      const bDueDateObs = b.observations.find(o => o.startsWith('Due:'));
      
      if (aDueDateObs && bDueDateObs) {
        const aDate = new Date(aDueDateObs.split(':')[1].trim());
        const bDate = new Date(bDueDateObs.split(':')[1].trim());
        return aDate.getTime() - bDate.getTime();
      }
      return 0;
    });
    
    // Find exams for this course
    const exams: Entity[] = [];
    for (const relation of graph.relations) {
      if (relation.relationType === 'scheduled_for' && relation.from === courseName) {
        const exam = graph.entities.find(e => e.name === relation.to && e.entityType === 'exam');
        if (exam) {
          exams.push(exam);
        }
      }
    }
    
    // Sort exams by date if available
    exams.sort((a, b) => {
      const aDateObs = a.observations.find(o => o.startsWith('Date:'));
      const bDateObs = b.observations.find(o => o.startsWith('Date:'));
      
      if (aDateObs && bDateObs) {
        const aDate = new Date(aDateObs.split(':')[1].trim());
        const bDate = new Date(bDateObs.split(':')[1].trim());
        return aDate.getTime() - bDate.getTime();
      }
      return 0;
    });
    
    // Find concepts covered in this course
    const concepts: Entity[] = [];
    for (const relation of graph.relations) {
      if (relation.relationType === 'covers' && relation.from === courseName) {
        const concept = graph.entities.find(e => e.name === relation.to && e.entityType === 'concept');
        if (concept) {
          concepts.push(concept);
        }
      }
    }
    
    // Find resources for this course (textbooks, articles, etc.)
    const resources: Entity[] = [];
    for (const relation of graph.relations) {
      if (relation.relationType === 'helps_with' && relation.to === courseName) {
        const resource = graph.entities.find(e => e.name === relation.from && e.entityType === 'resource');
        if (resource) {
          resources.push(resource);
        }
      }
    }
    
    // Find notes for this course
    const notes: Entity[] = [];
    for (const relation of graph.relations) {
      if (relation.relationType === 'created_for' && relation.to === courseName) {
        const note = graph.entities.find(e => e.name === relation.from && e.entityType === 'note');
        if (note) {
          notes.push(note);
        }
      }
    }
    
    // Extract course info from observations
    const courseCode = course.observations.find(o => o.startsWith('Code:'))?.split(':')[1].trim() || 'N/A';
    const courseLocation = course.observations.find(o => o.startsWith('Location:'))?.split(':')[1].trim() || 'N/A';
    const courseSchedule = course.observations.find(o => o.startsWith('Schedule:'))?.split(':')[1].trim() || 'N/A';
    const courseStatus = course.observations.find(o => o.startsWith('Status:'))?.split(':')[1].trim() || 'N/A';
    
    return {
      course,
      term,
      professor,
      info: {
        code: courseCode,
        location: courseLocation,
        schedule: courseSchedule,
        status: courseStatus
      },
      summary: {
        lectureCount: lectures.length,
        assignmentCount: assignments.length,
        examCount: exams.length,
        conceptCount: concepts.length,
        resourceCount: resources.length,
        noteCount: notes.length
      },
      lectures,
      assignments,
      exams,
      concepts,
      resources,
      notes
    };
  }

  // Returns assignments and exams with approaching due dates
  async getUpcomingDeadlines(termName?: string, courseName?: string, daysAhead: number = 14): Promise<any> {
    const graph = await this.loadGraph();
    const today = new Date();
    const endDate = new Date();
    endDate.setDate(today.getDate() + daysAhead);
    
    // Filter for specific term if provided
    let relevantCourses: Entity[] = [];
    if (termName) {
      // Find the specific term
      const term = graph.entities.find(e => e.name === termName && e.entityType === 'term');
      if (!term) {
        throw new Error(`Term '${termName}' not found`);
      }
      
      // Find courses in this term
      for (const relation of graph.relations) {
        if (relation.relationType === 'part_of' && relation.from === relation.to && relation.to === termName) {
          const course = graph.entities.find(e => e.name === relation.from && e.entityType === 'course');
          if (course) {
            relevantCourses.push(course);
          }
        }
      }
    } else {
      // Get all courses if no term specified
      relevantCourses = graph.entities.filter(e => e.entityType === 'course');
    }
    
    // Filter for specific course if provided
    if (courseName) {
      relevantCourses = relevantCourses.filter(c => c.name === courseName);
      if (relevantCourses.length === 0) {
        throw new Error(`Course '${courseName}' not found`);
      }
    }
    
    // Find all assignments and exams for these courses
    const deadlines: { entity: Entity; dueDate: Date; course: Entity; daysRemaining: number }[] = [];
    
    for (const course of relevantCourses) {
      // Find assignments for this course
      for (const relation of graph.relations) {
        if (relation.relationType === 'assigned_in' && relation.to === course.name) {
          const assignment = graph.entities.find(e => e.name === relation.from && e.entityType === 'assignment');
          if (assignment) {
            // Check due date
            const dueDateObs = assignment.observations.find(o => o.startsWith('Due:'));
            if (dueDateObs) {
              const dueDateStr = dueDateObs.split(':')[1].trim();
              const dueDate = new Date(dueDateStr);
              
              // Check if it's in our date range
              if (dueDate >= today && dueDate <= endDate) {
                const daysRemaining = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                deadlines.push({
                  entity: assignment,
                  dueDate,
                  course,
                  daysRemaining
                });
              }
            }
          }
        }
      }
      
      // Find exams for this course
      for (const relation of graph.relations) {
        if (relation.relationType === 'scheduled_for' && relation.from === course.name) {
          const exam = graph.entities.find(e => e.name === relation.to && e.entityType === 'exam');
          if (exam) {
            // Check exam date
            const dateObs = exam.observations.find(o => o.startsWith('Date:'));
            if (dateObs) {
              const dateStr = dateObs.split(':')[1].trim();
              const examDate = new Date(dateStr);
              
              // Check if it's in our date range
              if (examDate >= today && examDate <= endDate) {
                const daysRemaining = Math.ceil((examDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                deadlines.push({
                  entity: exam,
                  dueDate: examDate,
                  course,
                  daysRemaining
                });
              }
            }
          }
        }
      }
    }
    
    // Sort by due date
    deadlines.sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
    
    return {
      deadlines,
      startDate: today.toISOString().slice(0, 10),
      endDate: endDate.toISOString().slice(0, 10),
      courseFilter: courseName,
      termFilter: termName,
      count: deadlines.length
    };
  }

  // Get detailed information about assignment status, including progress, related concepts, and resources
  async getAssignmentStatus(assignmentName: string): Promise<any> {
    const graph = await this.loadGraph();
    
    // Find the assignment
    const assignment = graph.entities.find(e => e.name === assignmentName && e.entityType === 'assignment');
    if (!assignment) {
      throw new Error(`Assignment '${assignmentName}' not found`);
    }
    
    // Find the course this assignment belongs to
    let course: Entity | undefined;
    for (const relation of graph.relations) {
      if (relation.relationType === 'assigned_in' && relation.from === assignmentName) {
        course = graph.entities.find(e => e.name === relation.to && e.entityType === 'course');
        if (course) {
          break;
        }
      }
    }
    
    // Get status from observations
    const status = assignment.observations.find(o => o.startsWith('Status:'))?.split(':')[1].trim() || 'not_started';
    const dueDate = assignment.observations.find(o => o.startsWith('Due:'))?.split(':')[1].trim();
    const pointsWorth = assignment.observations.find(o => o.startsWith('Points:'))?.split(':')[1].trim();
    const instructions = assignment.observations.find(o => o.startsWith('Instructions:'))?.split(':')[1].trim();
    
    // Calculate time remaining if due date exists
    let timeRemaining: number | null = null;
    let daysRemaining: number | null = null;
    let isOverdue = false;
    
    if (dueDate) {
      const dueDateTime = new Date(dueDate).getTime();
      const now = new Date().getTime();
      timeRemaining = dueDateTime - now;
      daysRemaining = Math.ceil(timeRemaining / (1000 * 60 * 60 * 24));
      isOverdue = timeRemaining < 0;
    }
    
    // Find concepts related to this assignment
    const concepts: Entity[] = [];
    for (const relation of graph.relations) {
      if (relation.relationType === 'covers' && relation.from === assignmentName) {
        const concept = graph.entities.find(e => e.name === relation.to && e.entityType === 'concept');
        if (concept) {
          concepts.push(concept);
        }
      }
    }
    
    // Find resources that might help with this assignment
    const resources: Entity[] = [];
    
    // Direct resources for the assignment
    for (const relation of graph.relations) {
      if (relation.relationType === 'helps_with' && relation.to === assignmentName) {
        const resource = graph.entities.find(e => e.name === relation.from && e.entityType === 'resource');
        if (resource) {
          resources.push(resource);
        }
      }
    }
    
    // Resources for concepts related to the assignment
    for (const concept of concepts) {
      for (const relation of graph.relations) {
        if (relation.relationType === 'helps_with' && relation.to === concept.name) {
          const resource = graph.entities.find(e => e.name === relation.from && e.entityType === 'resource');
          if (resource && !resources.some(r => r.name === resource.name)) {
            resources.push(resource);
          }
        }
      }
    }
    
    // Find notes related to this assignment
    const notes: Entity[] = [];
    for (const relation of graph.relations) {
      if (relation.relationType === 'created_for' && relation.to === assignmentName) {
        const note = graph.entities.find(e => e.name === relation.from && e.entityType === 'note');
        if (note) {
          notes.push(note);
        }
      }
    }
    
    // Add notes related to concepts covered by the assignment
    for (const concept of concepts) {
      for (const relation of graph.relations) {
        if (relation.relationType === 'references' && relation.to === concept.name) {
          const note = graph.entities.find(e => e.name === relation.from && e.entityType === 'note');
          if (note && !notes.some(n => n.name === note.name)) {
            notes.push(note);
          }
        }
      }
    }
    
    return {
      assignment,
      course,
      info: {
        status,
        dueDate,
        pointsWorth,
        instructions,
        timeRemaining,
        daysRemaining,
        isOverdue
      },
      concepts,
      resources,
      notes
    };
  }

  // Get exam preparation resources, related concepts, and study plan
  async getExamPrep(examName: string): Promise<any> {
    const graph = await this.loadGraph();
    
    // Find the exam
    const exam = graph.entities.find(e => e.name === examName && e.entityType === 'exam');
    if (!exam) {
      throw new Error(`Exam '${examName}' not found`);
    }
    
    // Find the course this exam is for
    let course: Entity | undefined;
    for (const relation of graph.relations) {
      if (relation.relationType === 'scheduled_for' && relation.to === examName) {
        course = graph.entities.find(e => e.name === relation.from && e.entityType === 'course');
        if (course) {
          break;
        }
      }
    }
    
    // Get exam info from observations
    const examDate = exam.observations.find(o => o.startsWith('Date:'))?.split(':')[1].trim();
    const examLocation = exam.observations.find(o => o.startsWith('Location:'))?.split(':')[1].trim();
    const examFormat = exam.observations.find(o => o.startsWith('Format:'))?.split(':')[1].trim();
    const examDuration = exam.observations.find(o => o.startsWith('Duration:'))?.split(':')[1].trim();
    
    // Calculate time remaining if exam date exists
    let timeRemaining: number | null = null;
    let daysRemaining: number | null = null;
    
    if (examDate) {
      const examDateTime = new Date(examDate).getTime();
      const now = new Date().getTime();
      timeRemaining = examDateTime - now;
      daysRemaining = Math.ceil(timeRemaining / (1000 * 60 * 60 * 24));
    }
    
    // Find concepts covered in the exam
    const concepts: Entity[] = [];
    for (const relation of graph.relations) {
      if (relation.relationType === 'covers' && relation.from === examName) {
        const concept = graph.entities.find(e => e.name === relation.to && e.entityType === 'concept');
        if (concept) {
          concepts.push(concept);
        }
      }
    }
    
    // If no concepts directly related to exam, get concepts from the course
    if (concepts.length === 0 && course) {
      for (const relation of graph.relations) {
        if (relation.relationType === 'covers' && relation.from === course.name) {
          const concept = graph.entities.find(e => e.name === relation.to && e.entityType === 'concept');
          if (concept) {
            concepts.push(concept);
          }
        }
      }
    }
    
    // Find resources helpful for the exam
    const resources: Entity[] = [];
    
    // Direct resources for the exam
    for (const relation of graph.relations) {
      if (relation.relationType === 'helps_with' && relation.to === examName) {
        const resource = graph.entities.find(e => e.name === relation.from && e.entityType === 'resource');
        if (resource) {
          resources.push(resource);
        }
      }
    }
    
    // Resources for concepts covered by the exam
    for (const concept of concepts) {
      for (const relation of graph.relations) {
        if (relation.relationType === 'helps_with' && relation.to === concept.name) {
          const resource = graph.entities.find(e => e.name === relation.from && e.entityType === 'resource');
          if (resource && !resources.some(r => r.name === resource.name)) {
            resources.push(resource);
          }
        }
      }
    }
    
    // Resources for the course
    if (course) {
      for (const relation of graph.relations) {
        if (relation.relationType === 'helps_with' && relation.to === course.name) {
          const resource = graph.entities.find(e => e.name === relation.from && e.entityType === 'resource');
          if (resource && !resources.some(r => r.name === resource.name)) {
            resources.push(resource);
          }
        }
      }
    }
    
    // Find notes related to the exam
    const notes: Entity[] = [];
    
    // Direct notes for the exam
    for (const relation of graph.relations) {
      if (relation.relationType === 'created_for' && relation.to === examName) {
        const note = graph.entities.find(e => e.name === relation.from && e.entityType === 'note');
        if (note) {
          notes.push(note);
        }
      }
    }
    
    // Notes for concepts covered in the exam
    for (const concept of concepts) {
      for (const relation of graph.relations) {
        if (relation.relationType === 'references' && relation.to === concept.name) {
          const note = graph.entities.find(e => e.name === relation.from && e.entityType === 'note');
          if (note && !notes.some(n => n.name === note.name)) {
            notes.push(note);
          }
        }
      }
    }
    
    // Find previous exams for the course
    const previousExams: Entity[] = [];
    if (course) {
      for (const relation of graph.relations) {
        if (relation.relationType === 'scheduled_for' && relation.from === course.name && relation.to !== examName) {
          const prevExam = graph.entities.find(e => e.name === relation.to && e.entityType === 'exam');
          if (prevExam) {
            const prevExamDate = prevExam.observations.find(o => o.startsWith('Date:'))?.split(':')[1].trim();
            if (prevExamDate && new Date(prevExamDate) < new Date()) {
              previousExams.push(prevExam);
            }
          }
        }
      }
    }
    
    // Find study sessions scheduled for this exam
    // Note: We no longer use studySession entities, this section is removed
    const studySessions: Entity[] = [];
    
    // Get concepts covered in this exam
    const conceptsCovered: Entity[] = [];
    
    return {
      exam,
      course,
      info: {
        examDate,
        examLocation,
        examFormat,
        examDuration,
        timeRemaining,
        daysRemaining
      },
      concepts,
      resources,
      notes,
      previousExams,
      studySessions,
      summary: {
        conceptCount: concepts.length,
        resourceCount: resources.length,
        noteCount: notes.length,
        previousExamCount: previousExams.length,
        studySessionCount: studySessions.length
      }
    };
  }

  // Find concepts related to a given concept and how they're connected
  async findRelatedConcepts(conceptName: string, depth: number = 1): Promise<any> {
    const graph = await this.loadGraph();
    
    // Find the concept
    const concept = graph.entities.find(e => e.name === conceptName && e.entityType === 'concept');
    if (!concept) {
      throw new Error(`Concept '${conceptName}' not found`);
    }
    
    // Initialize results
    const relatedConcepts: {
      concept: Entity;
      relationPath: string[];
      depth: number;
      courses: Entity[];
      resources: Entity[];
    }[] = [];
    
    // Set to track processed concepts to avoid duplicates
    const processedConcepts = new Set<string>();
    processedConcepts.add(conceptName);
    
    // Queue of concepts to process with their current depth and path
    const queue: {
      name: string;
      currentDepth: number;
      path: string[];
    }[] = [{ name: conceptName, currentDepth: 0, path: [] }];
    
    // Process the queue
    while (queue.length > 0) {
      const { name, currentDepth, path } = queue.shift()!;
      
      // Skip if we've reached max depth (except for the initial concept)
      if (currentDepth > depth && name !== conceptName) continue;
      
      // Find the concept entity
      const currentConcept = graph.entities.find(e => e.name === name && e.entityType === 'concept');
      if (!currentConcept) continue;
      
      // Skip the initial concept for the results
      if (name !== conceptName) {
        // Find courses that cover this concept
        const courses: Entity[] = [];
        for (const relation of graph.relations) {
          if (relation.relationType === 'covers' && relation.to === name) {
            const course = graph.entities.find(e => e.name === relation.from && e.entityType === 'course');
            if (course) {
              courses.push(course);
            }
          }
        }
        
        // Find resources that help with this concept
        const resources: Entity[] = [];
        for (const relation of graph.relations) {
          if (relation.relationType === 'helps_with' && relation.to === name) {
            const resource = graph.entities.find(e => e.name === relation.from && e.entityType === 'resource');
            if (resource) {
              resources.push(resource);
            }
          }
        }
        
        relatedConcepts.push({
          concept: currentConcept,
          relationPath: [...path],
          depth: currentDepth,
          courses,
          resources
        });
      }
      
      // Find directly related concepts through 'related_to'
      for (const relation of graph.relations) {
        if (relation.relationType === 'related_to') {
          let nextConcept: string | null = null;
          
          // Check bidirectional relation
          if (relation.from === name) {
            nextConcept = relation.to;
          } else if (relation.to === name) {
            nextConcept = relation.from;
          }
          
          if (nextConcept && !processedConcepts.has(nextConcept)) {
            processedConcepts.add(nextConcept);
            queue.push({
              name: nextConcept,
              currentDepth: currentDepth + 1,
              path: [...path, `related_to ${nextConcept}`]
            });
          }
        }
      }
      
      // Find prerequisites
      for (const relation of graph.relations) {
        if (relation.relationType === 'prerequisite_for') {
          let nextConcept: string | null = null;
          let relationDescription: string = '';
          
          if (relation.from === name) {
            nextConcept = relation.to;
            relationDescription = `prerequisite_for ${nextConcept}`;
          } else if (relation.to === name) {
            nextConcept = relation.from;
            relationDescription = `${nextConcept} is_prerequisite_for this`;
          }
          
          if (nextConcept && !processedConcepts.has(nextConcept)) {
            processedConcepts.add(nextConcept);
            queue.push({
              name: nextConcept,
              currentDepth: currentDepth + 1,
              path: [...path, relationDescription]
            });
          }
        }
      }
    }
    
    // Sort related concepts by depth
    relatedConcepts.sort((a, b) => a.depth - b.depth);
    
    return {
      concept,
      relatedConcepts,
      summary: {
        totalRelated: relatedConcepts.length,
        maxDepth: depth
      }
    };
  }

  // Track lecture notes and find related concepts and resources
  async trackLectureNotes(courseName: string): Promise<any> {
    const graph = await this.loadGraph();
    
    // Find the course
    const course = graph.entities.find(e => e.name === courseName && e.entityType === 'course');
    if (!course) {
      throw new Error(`Course '${courseName}' not found`);
    }
    
    // Find lectures for this course
    const lectures: Entity[] = [];
    for (const relation of graph.relations) {
      if (relation.relationType === 'part_of' && relation.to === courseName) {
        const lecture = graph.entities.find(e => e.name === relation.from && e.entityType === 'lecture');
        if (lecture) {
          lectures.push(lecture);
        }
      }
    }
    
    // Sort lectures by date if available
    lectures.sort((a, b) => {
      const aDateObs = a.observations.find(o => o.startsWith('Date:'));
      const bDateObs = b.observations.find(o => o.startsWith('Date:'));
      
      if (aDateObs && bDateObs) {
        const aDate = new Date(aDateObs.split(':')[1].trim());
        const bDate = new Date(bDateObs.split(':')[1].trim());
        return aDate.getTime() - bDate.getTime();
      }
      return 0;
    });
    
    // Create a structure to hold lecture data with notes and concepts
    const lectureData: Array<{
      lecture: Entity;
      info: {
        date: string | undefined;
        topic: string | undefined;
      };
      notes: Entity[];
      concepts: Entity[];
      resources: Entity[];
      summary: {
        noteCount: number;
        conceptCount: number;
        resourceCount: number;
      };
    }> = [];
    
    for (const lecture of lectures) {
      // Get details about the lecture
      const lectureDate = lecture.observations.find(o => o.startsWith('Date:'))?.split(':')[1].trim();
      const lectureTopic = lecture.observations.find(o => o.startsWith('Topic:'))?.split(':')[1].trim();
      
      // Find notes for this lecture
      const notes: Entity[] = [];
      for (const relation of graph.relations) {
        if (relation.relationType === 'created_for' && relation.to === lecture.name) {
          const note = graph.entities.find(e => e.name === relation.from && e.entityType === 'note');
          if (note) {
            notes.push(note);
          }
        }
      }
      
      // Find concepts covered in this lecture
      const concepts: Entity[] = [];
      for (const relation of graph.relations) {
        if (relation.relationType === 'covers' && relation.from === lecture.name) {
          const concept = graph.entities.find(e => e.name === relation.to && e.entityType === 'concept');
          if (concept) {
            concepts.push(concept);
          }
        }
      }
      
      // Get resources related to this lecture
      const resources: Entity[] = [];
      for (const relation of graph.relations) {
        if (relation.relationType === 'helps_with' && relation.to === lecture.name) {
          const resource = graph.entities.find(e => e.name === relation.from && e.entityType === 'resource');
          if (resource) {
            resources.push(resource);
          }
        }
      }
      
      // Add resources related to concepts in this lecture
      for (const concept of concepts) {
        for (const relation of graph.relations) {
          if (relation.relationType === 'helps_with' && relation.to === concept.name) {
            const resource = graph.entities.find(e => e.name === relation.from && e.entityType === 'resource');
            if (resource && !resources.some(r => r.name === resource.name)) {
              resources.push(resource);
            }
          }
        }
      }
      
      lectureData.push({
        lecture,
        info: {
          date: lectureDate,
          topic: lectureTopic
        },
        notes,
        concepts,
        resources,
        summary: {
          noteCount: notes.length,
          conceptCount: concepts.length,
          resourceCount: resources.length
        }
      });
    }
    
    return {
      course,
      lectures: lectureData,
      summary: {
        lectureCount: lectures.length,
        totalNotes: lectureData.reduce((sum, ld) => sum + ld.notes.length, 0),
        totalConcepts: lectureData.reduce((sum, ld) => sum + ld.concepts.length, 0)
      }
    };
  }

  // Get term overview including courses, progress, and important dates
  async getTermOverview(termName: string): Promise<any> {
    const graph = await this.loadGraph();
    
    // Find the term
    const term = graph.entities.find(e => e.name === termName && e.entityType === 'term');
    if (!term) {
      throw new Error(`Term '${termName}' not found`);
    }
    
    // Get term info
    const startDate = term.observations.find(o => o.startsWith('StartDate:'))?.split(':')[1].trim();
    const endDate = term.observations.find(o => o.startsWith('EndDate:'))?.split(':')[1].trim();
    const status = term.observations.find(o => o.startsWith('Status:'))?.split(':')[1].trim() || 'in_progress';
    
    // Find courses for this term
    const courses: Entity[] = [];
    for (const relation of graph.relations) {
      if (relation.relationType === 'part_of' && relation.to === termName) {
        const course = graph.entities.find(e => e.name === relation.from && e.entityType === 'course');
        if (course) {
          courses.push(course);
        }
      }
    }
    
    // Get detailed information for each course
    const courseData: Array<{
      course: Entity;
      professor: Entity | undefined;
      info: {
        code: string | undefined;
        schedule: string | undefined;
        status: string;
      };
      progress: {
        completedAssignments: number;
        totalAssignments: number;
        completionRate: number;
      };
      upcomingExam: Entity | undefined;
      summary: {
        assignmentCount: number;
        examCount: number;
      };
    }> = [];
    
    for (const course of courses) {
      // Get course info
      const courseCode = course.observations.find(o => o.startsWith('Code:'))?.split(':')[1].trim();
      const courseSchedule = course.observations.find(o => o.startsWith('Schedule:'))?.split(':')[1].trim();
      const courseStatus = course.observations.find(o => o.startsWith('Status:'))?.split(':')[1].trim() || 'in_progress';
      
      // Find professor
      let professor: Entity | undefined;
      for (const relation of graph.relations) {
        if (relation.relationType === 'taught_by' && relation.from === course.name) {
          professor = graph.entities.find(e => e.name === relation.to && e.entityType === 'professor');
          if (professor) {
            break;
          }
        }
      }
      
      // Find assignments for this course
      const assignments: Entity[] = [];
      for (const relation of graph.relations) {
        if (relation.relationType === 'assigned_in' && relation.to === course.name) {
          const assignment = graph.entities.find(e => e.name === relation.from && e.entityType === 'assignment');
          if (assignment) {
            assignments.push(assignment);
          }
        }
      }
      
      // Count completed and total assignments
      const completedAssignments = assignments.filter(a => 
        a.observations.find(o => o.startsWith('Status:'))?.split(':')[1].trim() === 'completed'
      ).length;
      
      // Find exams for this course
      const exams: Entity[] = [];
      for (const relation of graph.relations) {
        if (relation.relationType === 'scheduled_for' && relation.from === course.name) {
          const exam = graph.entities.find(e => e.name === relation.to && e.entityType === 'exam');
          if (exam) {
            exams.push(exam);
          }
        }
      }
      
      // Sort exams by date
      exams.sort((a, b) => {
        const aDateObs = a.observations.find(o => o.startsWith('Date:'));
        const bDateObs = b.observations.find(o => o.startsWith('Date:'));
        
        if (aDateObs && bDateObs) {
          const aDate = new Date(aDateObs.split(':')[1].trim());
          const bDate = new Date(bDateObs.split(':')[1].trim());
          return aDate.getTime() - bDate.getTime();
        }
        return 0;
      });
      
      // Get the next upcoming exam
      const upcomingExam = exams.find(e => {
        const dateObs = e.observations.find(o => o.startsWith('Date:'));
        if (dateObs) {
          const examDate = new Date(dateObs.split(':')[1].trim());
          return examDate > new Date();
        }
        return false;
      });
      
      courseData.push({
        course,
        professor,
        info: {
          code: courseCode,
          schedule: courseSchedule,
          status: courseStatus
        },
        progress: {
          completedAssignments,
          totalAssignments: assignments.length,
          completionRate: assignments.length > 0 ? 
            Math.round((completedAssignments / assignments.length) * 100) : 0
        },
        upcomingExam,
        summary: {
          assignmentCount: assignments.length,
          examCount: exams.length
        }
      });
    }
    
    // Find all deadlines (assignments and exams) in this term
    const allDeadlines: {
      entity: Entity;
      type: 'assignment' | 'exam';
      course: Entity;
      date: Date;
      daysRemaining: number;
    }[] = [];
    
    // Current date for comparisons
    const today = new Date();
    
    // Process assignments
    for (const course of courses) {
      // Find assignments for this course
      for (const relation of graph.relations) {
        if (relation.relationType === 'assigned_in' && relation.to === course.name) {
          const assignment = graph.entities.find(e => e.name === relation.from && e.entityType === 'assignment');
          if (assignment) {
            // Check due date
            const dueDateObs = assignment.observations.find(o => o.startsWith('Due:'));
            if (dueDateObs) {
              const dueDateStr = dueDateObs.split(':')[1].trim();
              const dueDate = new Date(dueDateStr);
              
              // Only include future deadlines
              if (dueDate >= today) {
                const daysRemaining = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                allDeadlines.push({
                  entity: assignment,
                  type: 'assignment',
                  course,
                  date: dueDate,
                  daysRemaining
                });
              }
            }
          }
        }
      }
      
      // Find exams for this course
      for (const relation of graph.relations) {
        if (relation.relationType === 'scheduled_for' && relation.from === course.name) {
          const exam = graph.entities.find(e => e.name === relation.to && e.entityType === 'exam');
          if (exam) {
            // Check exam date
            const dateObs = exam.observations.find(o => o.startsWith('Date:'));
            if (dateObs) {
              const dateStr = dateObs.split(':')[1].trim();
              const examDate = new Date(dateStr);
              
              // Only include future dates
              if (examDate >= today) {
                const daysRemaining = Math.ceil((examDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                allDeadlines.push({
                  entity: exam,
                  type: 'exam',
                  course,
                  date: examDate,
                  daysRemaining
                });
              }
            }
          }
        }
      }
    }
    
    // Sort all deadlines by date
    allDeadlines.sort((a, b) => a.date.getTime() - b.date.getTime());
    
    return {
      term,
      info: {
        startDate,
        endDate,
        status
      },
      courses: courseData,
      upcomingDeadlines: allDeadlines.slice(0, 10), // Return the next 10 deadlines
      summary: {
        courseCount: courses.length,
        deadlineCount: allDeadlines.length
      }
    };
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
  return `stud_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
}

// Setup the MCP server
async function main() {
  const knowledgeGraphManager = new KnowledgeGraphManager();
  
  // Helper function to get current term
  async function getCurrentTerm(): Promise<string | null> {
    // Find the most recent term with status "active"
    const termQuery = await knowledgeGraphManager.searchNodes("entityType:term status:active");
    if (termQuery.entities.length > 0) {
      return termQuery.entities[0].name;
    }
    return null;
  }
  
  // Create the MCP server using the new API
  const server = new McpServer({
    name: "Context Manager",
    version: "1.0.0"
  });

  // Define a resource that exposes the entire graph
  server.resource(
    "graph",
    "graph://student",
    async (uri) => ({
      contents: [{
        uri: uri.href,
        text: JSON.stringify(await knowledgeGraphManager.readGraph(), null, 2)
      }]
    })
  );

  /**
   * Load context for a specific entity
   */
  server.tool(
    "loadcontext",
    toolDescriptions["loadcontext"],
    {
      entityName: z.string(),
      entityType: z.enum(validEntityTypes).optional().describe("Type of entity to load, defaults to 'course'"),
      sessionId: z.string().optional().describe("Session ID from startsession to track context loading")
    },
    async ({ entityName, entityType = "course", sessionId }) => {
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
        
        if (entityType === "course") {
          // Get course overview
          const courseOverview = await knowledgeGraphManager.getCourseOverview(entityName);
          
          // Format course context message
          const status = entity.observations.find(o => o.startsWith("Status:"))?.substring(7) || "current";
          const code = entity.observations.find(o => o.startsWith("Code:"))?.substring(5) || "No code";
          const schedule = entity.observations.find(o => o.startsWith("Schedule:"))?.substring(9) || "No schedule";
          const location = entity.observations.find(o => o.startsWith("Location:"))?.substring(9) || "No location";
          const description = entity.observations.find(o => !o.startsWith("Status:") && !o.startsWith("Code:") && 
            !o.startsWith("Schedule:") && !o.startsWith("Location:"));
          
          // Format lectures
          const lecturesText = courseOverview.lectures?.map((lecture: Entity) => {
            const date = lecture.observations.find(o => o.startsWith("Date:"))?.substring(5) || "No date";
            const topic = lecture.observations.find(o => o.startsWith("Topic:"))?.substring(6) || "No topic";
            return `- **${lecture.name}** (${date}): ${topic}`;
          }).join("\n") || "No lectures found";
          
          // Format assignments
          const assignmentsText = courseOverview.assignments?.map((assignment: Entity) => {
            const dueDate = assignment.observations.find(o => o.startsWith("Due:"))?.substring(4) || "No due date";
            const status = assignment.observations.find(o => o.startsWith("Status:"))?.substring(7) || "Not started";
            const description = assignment.observations.find(o => !o.startsWith("Due:") && !o.startsWith("Status:"));
            return `- **${assignment.name}** (Due: ${dueDate}, Status: ${status}): ${description || "No description"}`;
          }).join("\n") || "No assignments found";
          
          // Format exams
          const examsText = courseOverview.exams?.map((exam: Entity) => {
            const date = exam.observations.find(o => o.startsWith("Date:"))?.substring(5) || "No date";
            const description = exam.observations.find(o => !o.startsWith("Date:"));
            return `- **${exam.name}** (${date}): ${description || "No description"}`;
          }).join("\n") || "No exams found";
          
          // Format concepts
          const conceptsText = courseOverview.concepts?.map((concept: Entity) => {
            return `- **${concept.name}**`;
          }).join("\n") || "No concepts found";
          
          // Format resources
          const resourcesText = courseOverview.resources?.map((resource: Entity) => {
            const type = resource.observations.find(o => o.startsWith("Type:"))?.substring(5) || "Unknown type";
            const description = resource.observations.find(o => !o.startsWith("Type:"));
            return `- **${resource.name}** (${type}): ${description || "No description"}`;
          }).join("\n") || "No resources found";
          
          // Add professor info if available
          const professorText = courseOverview.professor ? 
            `**Professor**: ${courseOverview.professor.name}
${courseOverview.professor.observations.join("\n")}` : "No professor information";
          
          // Add term info if available
          const termText = courseOverview.term ? 
            `**Term**: ${courseOverview.term.name}` : "No term information";
          
          contextMessage = `# Course Context: ${entityName}

## Course Details
- **Code**: ${code}
- **Status**: ${status}
- **Schedule**: ${schedule}
- **Location**: ${location}
- **Description**: ${description || "No description"}
- ${termText}
- ${professorText}

## Lectures
${lecturesText}

## Assignments
${assignmentsText}

## Exams
${examsText}

## Key Concepts
${conceptsText}

## Resources
${resourcesText}`;
        } 
        else if (entityType === "assignment") {
          // Get assignment status
          const assignmentStatus = await knowledgeGraphManager.getAssignmentStatus(entityName);
          
          // Format assignment context
          const status = entity.observations.find(o => o.startsWith("Status:"))?.substring(7) || "not_started";
          const dueDate = entity.observations.find(o => o.startsWith("Due:"))?.substring(4) || "No due date";
          const points = entity.observations.find(o => o.startsWith("Points:"))?.substring(7) || "Not specified";
          const instructions = entity.observations.find(o => o.startsWith("Instructions:"))?.substring(13) || "No instructions provided";
          
          // Calculate time remaining
          let timeRemainingText = "No due date specified";
          if (assignmentStatus.timeRemaining !== null) {
            if (assignmentStatus.isOverdue) {
              timeRemainingText = `OVERDUE by ${Math.abs(assignmentStatus.daysRemaining)} days`;
            } else {
              timeRemainingText = `${assignmentStatus.daysRemaining} days remaining`;
            }
          }
          
          // Get course name
          const courseName = assignmentStatus.course?.name || "Unknown course";
          
          // Format related concepts
          const conceptsText = assignmentStatus.concepts?.map((concept: Entity) => {
            return `- **${concept.name}**`;
          }).join("\n") || "No related concepts found";
          
          // Format related resources
          const resourcesText = assignmentStatus.resources?.map((resource: Entity) => {
            const type = resource.observations.find(o => o.startsWith("Type:"))?.substring(5) || "Unknown type";
            return `- **${resource.name}** (${type})`;
          }).join("\n") || "No resources found";
          
          // Format notes
          const notesText = assignmentStatus.notes?.map((note: Entity) => {
            const date = note.observations.find(o => o.startsWith("Date:"))?.substring(5) || "No date";
            return `- **${note.name}** (${date})`;
          }).join("\n") || "No notes found";
          
          contextMessage = `# Assignment Context: ${entityName}

## Assignment Details
- **Course**: ${courseName}
- **Status**: ${status}
- **Due Date**: ${dueDate}
- **Points**: ${points}
- **Time Remaining**: ${timeRemainingText}

## Instructions
${instructions}

## Related Concepts
${conceptsText}

## Helpful Resources
${resourcesText}

## Your Notes
${notesText}`;
        }
        else if (entityType === "exam") {
          // Get exam prep information
          const examPrep = await knowledgeGraphManager.getExamPrep(entityName);
          
          // Format exam context
          const examDate = entity.observations.find(o => o.startsWith("Date:"))?.substring(5) || "No date scheduled";
          const examLocation = entity.observations.find(o => o.startsWith("Location:"))?.substring(9) || "No location specified";
          const examFormat = entity.observations.find(o => o.startsWith("Format:"))?.substring(7) || "No format specified";
          const examDuration = entity.observations.find(o => o.startsWith("Duration:"))?.substring(9) || "No duration specified";
          
          // Calculate time remaining
          let timeRemainingText = "No exam date specified";
          if (examPrep.daysRemaining !== null) {
            timeRemainingText = `${examPrep.daysRemaining} days until exam`;
          }
          
          // Get course name
          const courseName = examPrep.course?.name || "Unknown course";
          
          // Format concepts covered
          const conceptsText = examPrep.concepts?.map((concept: Entity) => {
            return `- **${concept.name}**`;
          }).join("\n") || "No concepts listed";
          
          // Format study resources
          const resourcesText = examPrep.resources?.map((resource: Entity) => {
            const type = resource.observations.find(o => o.startsWith("Type:"))?.substring(5) || "Unknown type";
            return `- **${resource.name}** (${type})`;
          }).join("\n") || "No resources found";
          
          // Format lectures
          const lecturesText = examPrep.lectures?.map((lecture: Entity) => {
            const date = lecture.observations.find(o => o.startsWith("Date:"))?.substring(5) || "No date";
            const topic = lecture.observations.find(o => o.startsWith("Topic:"))?.substring(6) || "No topic";
            return `- **${lecture.name}** (${date}): ${topic}`;
          }).join("\n") || "No lectures found";
          
          contextMessage = `# Exam Context: ${entityName}

## Exam Details
- **Course**: ${courseName}
- **Date**: ${examDate}
- **Time Remaining**: ${timeRemainingText}
- **Location**: ${examLocation}
- **Format**: ${examFormat}
- **Duration**: ${examDuration}

## Concepts to Study
${conceptsText}

## Key Lectures
${lecturesText}

## Study Resources
${resourcesText}`;
        }
        else if (entityType === "concept") {
          // Get related concepts
          const relatedConceptsData = await knowledgeGraphManager.findRelatedConcepts(entityName);
          
          // Format concept context
          const description = entity.observations.find(o => !o.startsWith("Level:")) || "No description available";
          const level = entity.observations.find(o => o.startsWith("Level:"))?.substring(6) || "Beginner";
          
          // Format related concepts
          const relatedConceptsText = relatedConceptsData.relatedConcepts?.map((related: {
            concept: Entity;
            relationPath: string[];
            depth: number;
          }) => {
            return `- **${related.concept.name}** (Connection: ${related.relationPath.join(' → ')})`;
          }).join("\n") || "No related concepts found";
          
          // Format courses that cover this concept
          const coursesText = relatedConceptsData.courses?.map((course: Entity) => {
            return `- **${course.name}**`;
          }).join("\n") || "No courses found";
          
          // Format resources about this concept
          const resourcesText = relatedConceptsData.resources?.map((resource: Entity) => {
            const type = resource.observations.find(o => o.startsWith("Type:"))?.substring(5) || "Unknown type";
            return `- **${resource.name}** (${type})`;
          }).join("\n") || "No resources found";
          
          contextMessage = `# Concept Context: ${entityName}

## Concept Details
- **Difficulty Level**: ${level}
- **Description**: ${description}

## Related Concepts
${relatedConceptsText}

## Covered in Courses
${coursesText}

## Learning Resources
${resourcesText}`;
        }
        else if (entityType === "term") {
          // Get term overview
          const termOverview = await knowledgeGraphManager.getTermOverview(entityName);
          
          // Format term context
          const startDate = entity.observations.find(o => o.startsWith("StartDate:"))?.substring(10) || "No start date";
          const endDate = entity.observations.find(o => o.startsWith("EndDate:"))?.substring(8) || "No end date";
          const status = entity.observations.find(o => o.startsWith("Status:"))?.substring(7) || "Unknown status";
          
          // Format courses in this term
          const coursesText = termOverview.courseData?.map((courseData: {
            course: Entity;
            professor: Entity | undefined;
            info: any;
            progress: any;
          }) => {
            return `- **${courseData.course.name}** (${courseData.info.code || "No code"}, ${courseData.info.status}): ${courseData.progress.completionRate || 0}% complete`;
          }).join("\n\n") || "No courses found";
          
          // Format upcoming deadlines
          const deadlinesText = termOverview.upcomingDeadlines?.map((deadline: {
            entity: Entity;
            dueDate: string;
            course: Entity;
            daysRemaining: number;
          }) => {
            return `- **${deadline.entity.name}** (${deadline.entity.entityType})
  Course: ${deadline.course.name}
  Due: ${deadline.dueDate} (${deadline.daysRemaining} days remaining)`;
          }).join("\n\n") || "No upcoming deadlines";
          
          contextMessage = `# Term Context: ${entityName}

## Term Details
- **Start Date**: ${startDate}
- **End Date**: ${endDate}
- **Status**: ${status}

## Courses This Term
${coursesText}

## Upcoming Deadlines
${deadlinesText}`;
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
          const observationsText = entity.observations.map(obs => `- ${obs}`).join("\n") || "No observations";
          
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
            course: ""
          },
          completed: !params.nextStageNeeded
        };
        
      case "conceptsLearned":
        // Process concepts learned stage
        return {
          stage: "conceptsLearned",
          stageNumber: params.stageNumber,
          analysis: params.analysis || "",
          stageData: params.stageData || { concepts: [] },
          completed: !params.nextStageNeeded
        };
        
      case "assignmentUpdates":
        // Process assignment updates stage
        return {
          stage: "assignmentUpdates",
          stageNumber: params.stageNumber,
          analysis: params.analysis || "",
          stageData: params.stageData || { updates: [] },
          completed: !params.nextStageNeeded
        };
        
      case "newConcepts":
        // Process new concepts stage
        return {
          stage: "newConcepts",
          stageNumber: params.stageNumber,
          analysis: params.analysis || "",
          stageData: params.stageData || { concepts: [] },
          completed: !params.nextStageNeeded
        };
        
      case "courseStatus":
        // Process course status stage
        return {
          stage: "courseStatus",
          stageNumber: params.stageNumber,
          analysis: params.analysis || "",
          stageData: params.stageData || { 
            courseStatus: "",
            courseObservation: ""
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

  // Helper function to assemble the final end-session arguments
  function assembleEndSessionArgs(stages: any[]): any {
    const summaryStage = stages.find(s => s.stage === "summary");
    const conceptsLearnedStage = stages.find(s => s.stage === "conceptsLearned");
    const assignmentUpdatesStage = stages.find(s => s.stage === "assignmentUpdates");
    const newConceptsStage = stages.find(s => s.stage === "newConcepts");
    const courseStatusStage = stages.find(s => s.stage === "courseStatus");
    
    // Get current date
    const date = new Date().toISOString().split('T')[0];
    
    return {
      date,
      summary: summaryStage?.stageData?.summary || "",
      duration: summaryStage?.stageData?.duration || "unknown",
      course: summaryStage?.stageData?.course || "",
      conceptsLearned: JSON.stringify(conceptsLearnedStage?.stageData?.concepts || []),
      assignmentUpdates: JSON.stringify(assignmentUpdatesStage?.stageData?.updates || []),
      courseStatus: courseStatusStage?.stageData?.courseStatus || "",
      courseObservation: courseStatusStage?.stageData?.courseObservation || "",
      newConcepts: JSON.stringify(newConceptsStage?.stageData?.concepts || [])
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
   *   "sessionId": "stu_1234567890_abc123",  // From startsession
   *   "stage": "summary",
   *   "stageNumber": 1,
   *   "totalStages": 6, 
   *   "analysis": "Analyzed progress on studying for the final exam",
   *   "stageData": {
   *     "summary": "Reviewed course materials and completed practice problems",
   *     "duration": "2 hours",
   *     "focus": "Data Structures"  // Course name
   *   },
   *   "nextStageNeeded": true,  // More stages coming
   *   "isRevision": false
   * }
   * 
   * 2. Middle stage for concepts:
   * {
   *   "sessionId": "stu_1234567890_abc123",
   *   "stage": "conceptsLearned",
   *   "stageNumber": 2,
   *   "totalStages": 6,
   *   "analysis": "Listed key concepts studied",
   *   "stageData": {
   *     "concepts": [
   *       "Balanced binary trees",
   *       "Red-black trees",
   *       "Tree traversal algorithms"
   *     ]
   *   },
   *   "nextStageNeeded": true,
   *   "isRevision": false
   * }
   * 
   * 3. Final assembly stage:
   * {
   *   "sessionId": "stu_1234567890_abc123",
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
      stage: z.string().describe("Current stage of analysis: 'summary', 'conceptsLearned', 'assignmentProgress', 'questions', 'nextSteps', or 'assembly'"),
      stageNumber: z.number().int().positive().describe("The sequence number of the current stage (starts at 1)"),
      totalStages: z.number().int().positive().describe("Total number of stages in the workflow (typically 5 for standard workflow)"),
      analysis: z.string().optional().describe("Text analysis or observations for the current stage"),
      stageData: z.record(z.string(), z.any()).optional().describe(`Stage-specific data structure - format depends on the stage type:
      - For 'summary' stage: { summary: "Session summary text", duration: "2 hours", focus: "CourseName" }
      - For 'conceptsLearned' stage: { concepts: ["Concept A", "Concept B", "Concept C"] }
      - For 'assignmentProgress' stage: { assignments: [{ name: "Assignment1", status: "completed" }, { name: "Assignment2", status: "in_progress" }] }
      - For 'questions' stage: { questions: ["Question about topic X", "Question about concept Y"] }
      - For 'nextSteps' stage: { nextSteps: ["Review chapter 7", "Complete practice problems", "Attend office hours"] }
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
            const course = args.course;
            const conceptsLearned = args.conceptsLearned ? JSON.parse(args.conceptsLearned) : [];
            const assignmentUpdates = args.assignmentUpdates ? JSON.parse(args.assignmentUpdates) : [];
            const courseStatus = args.courseStatus;
            const courseObservation = args.courseObservation;
            const newConcepts = args.newConcepts ? JSON.parse(args.newConcepts) : [];
            
            // 2. Create concept entities for new concepts learned
            const conceptEntities = conceptsLearned.map((concept: string, i: number) => ({
              name: `Concept_${date.replace(/-/g, "")}_${i + 1}`,
              entityType: "concept",
              observations: [concept]
            }));
            
            if (conceptEntities.length > 0) {
              await knowledgeGraphManager.createEntities(conceptEntities);
              
              // Link concepts to course (no longer to session)
              const conceptRelations = conceptEntities.map((concept: {name: string}) => ({
                from: course,
                to: concept.name,
                relationType: "contains"
              }));
              
              await knowledgeGraphManager.createRelations(conceptRelations);
            }
            
            // 3. Update assignment statuses
            for (const assignment of assignmentUpdates) {
              // First find the assignment entity
              const assignmentGraph = await knowledgeGraphManager.searchNodes(`name:${assignment.name}`);
              if (assignmentGraph.entities.length > 0) {
                // Update the status observation
                const assignmentEntity = assignmentGraph.entities[0];
                const observations = assignmentEntity.observations.filter(o => !o.startsWith("status:"));
                observations.push(`status:${assignment.status}`);
                
                await knowledgeGraphManager.deleteEntities([assignment.name]);
                await knowledgeGraphManager.createEntities([{
                  name: assignment.name,
                  entityType: "assignment",
                  observations
                }]);
                
                // If completed, link to course
                if (assignment.status === "completed") {
                  await knowledgeGraphManager.createRelations([{
                    from: course,
                    to: assignment.name,
                    relationType: "created_for"
                  }]);
                }
              }
            }
            
            // 4. Update course status
            const courseGraph = await knowledgeGraphManager.searchNodes(`name:${course}`);
            if (courseGraph.entities.length > 0) {
              const courseEntity = courseGraph.entities[0];
              let observations = courseEntity.observations.filter(o => !o.startsWith("status:") && !o.startsWith("updated:"));
              observations.push(`status:${courseStatus}`);
              observations.push(`updated:${date}`);
              
              if (courseObservation) {
                observations.push(courseObservation);
              }
              
              await knowledgeGraphManager.deleteEntities([course]);
              await knowledgeGraphManager.createEntities([{
                name: course,
                entityType: "course",
                observations
              }]);
            }
            
            // 5. Create new concept entities
            if (newConcepts && newConcepts.length > 0) {
              const newConceptEntities = newConcepts.map((concept: {name: string, description: string}, i: number) => ({
                name: concept.name,
                entityType: "concept",
                observations: [
                  concept.description,
                  `last_studied:${date}`
                ]
              }));
              
              await knowledgeGraphManager.createEntities(newConceptEntities);
              
              // Link concepts to course
              const conceptRelations = newConceptEntities.map((concept: {name: string}) => ({
                from: course,
                to: concept.name,
                relationType: "contains"
              }));
              
              await knowledgeGraphManager.createRelations(conceptRelations);
            }
            
            // Record session completion in persistent storage
            sessionState.push({
              type: 'session_completed',
              timestamp: new Date().toISOString(),
              date: date,
              summary: summary,
              course: course
            });
            
            sessionStates.set(params.sessionId, sessionState);
            await saveSessionStates(sessionStates);
            
            // Prepare the summary message
            const summaryMessage = `# Study Session Recorded

I've recorded your study session from ${date} focusing on ${course}.

## Concepts Learned
${conceptsLearned.map((c: string) => `- ${c}`).join('\n') || "No specific concepts recorded."}

## Assignment Updates
${assignmentUpdates.map((a: {name: string, status: string}) => `- ${a.name}: ${a.status}`).join('\n') || "No assignment updates."}

## Course Status
Course ${course} has been updated to: ${courseStatus}

${newConcepts && newConcepts.length > 0 ? `## New Concepts Added
${newConcepts.map((c: {name: string, description: string}) => `- ${c.name}: ${c.description}`).join('\n')}` : "No new concepts added."}

## Session Summary
${summary}

Would you like me to perform any additional updates to your student knowledge graph?`;
            
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
                  error: `Error recording study session: ${error instanceof Error ? error.message : String(error)}`
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
   * Start a new study session. Returns session ID, recent study sessions, active courses, and upcoming deadlines.
   * The output allows the user to easily choose what to focus on and which specific context to load.
   */
  server.tool(
    "startsession",
    toolDescriptions["startsession"],
    {},
    async () => {
      try {
        // Generate a unique session ID
        const sessionId = generateSessionId();
        
        // Get the current active term
        const currentTerm = await getCurrentTerm();
        
        // Get recent sessions from persistent storage instead of entities
        const sessionStates = await loadSessionStates();

        // Initialize the session state
        sessionStates.set(sessionId, []);
        await saveSessionStates(sessionStates);
        
        // Convert sessions map to array, sort by date, and take most recent ones
        const recentSessions = Array.from(sessionStates.entries())
          .map(([id, stages]) => {
            // Extract summary data from the first stage (if it exists)
            const summaryStage = stages.find(s => s.stage === "summary");
            return {
              id,
              date: summaryStage?.stageData?.date || "Unknown date",
              course: summaryStage?.stageData?.course || "Unknown course",
              summary: summaryStage?.stageData?.summary || "No summary available"
            };
          })
          .sort((a, b) => b.date.localeCompare(a.date))
          .slice(0, 3); // Default to 3 recent sessions
        
        // Get active courses
        const coursesQuery = await knowledgeGraphManager.searchNodes(`entityType:course ${currentTerm ? `term:${currentTerm}` : "status:active"}`);
        const courses = coursesQuery.entities;
        
        // Get upcoming deadlines (default to 14 days)
        const deadlines = await knowledgeGraphManager.getUpcomingDeadlines(
          currentTerm || undefined, 
          undefined, 
          14
        );

        // Get recent concepts studied
        const recentConceptsQuery = await knowledgeGraphManager.searchNodes("entityType:concept");
        const recentConcepts = recentConceptsQuery.entities
          .filter(e => e.observations.some(o => o.startsWith("last_studied:")))
          .sort((a, b) => {
            const dateA = a.observations.find(o => o.startsWith("last_studied:"))?.split(":")[1];
            const dateB = b.observations.find(o => o.startsWith("last_studied:"))?.split(":")[1];
            return dateB?.localeCompare(dateA || "") || 0;
          })
          .slice(0, 5);
        
        // Prepare message content
        const coursesText = courses.map(c => {
          const code = c.observations.find(o => o.startsWith("code:"))?.split(":")[1] || "";
          const desc = c.observations.find(o => o.startsWith("description:"))?.substring(12) || "No description";
          return `- **${c.name}** (${code}): ${desc}`;
        }).join("\n");
        
        const sessionsText = recentSessions.map(s => {
          return `- ${s.date}: ${s.course} - ${s.summary.substring(0, 100)}${s.summary.length > 100 ? '...' : ''}`;
        }).join("\n");
        
        const deadlinesText = deadlines.deadlines.map((d: any) => {
          const daysUntil = d.daysRemaining;
          return `- **${d.entity.name}** (${d.course.name}): Due in ${daysUntil} day${daysUntil !== 1 ? 's' : ''} on ${d.dueDate.toISOString().split('T')[0]}`;
        }).join("\n");
        
        const conceptsText = recentConcepts.map(c => {
          const lastStudied = c.observations.find(o => o.startsWith("last_studied:"))?.substring(12) || "Unknown";
          return `- **${c.name}**: Last studied on ${lastStudied}`;
        }).join("\n");
        
        const date = new Date().toISOString().split('T')[0];
        
        return {
          content: [{
            type: "text",
            text: `# Ask user to choose what to focus on in this session. Present the following options:

## Recent Study Sessions
${sessionsText || "No recent sessions found."}

## Current Courses
${coursesText || "No active courses found."}

## Upcoming Deadlines (Next 14 Days)
${deadlinesText || "No upcoming deadlines in the next 14 days."}

## Recently Studied Concepts
${conceptsText || "No recently studied concepts found."}

To load the context for a specific entity, use the \`loadcontext\` tool with the entity name and session ID - ${sessionId}`
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
   * Create new entities, relations, and observations.
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
            // Validate entity types
            for (const entity of data) {
              validateEntityType(entity.entityType);
            }
            
            // Ensure entities match the Entity interface
            const typedEntities: Entity[] = data.map((e: any) => ({
              name: e.name,
              entityType: e.entityType,
              observations: e.observations
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
              relationType: r.relationType
            }));
            result = await knowledgeGraphManager.createRelations(typedRelations);
            return {
              content: [{
                type: "text",
                text: JSON.stringify({ success: true, created: result }, null, 2)
              }]
            };
            
          case "observations":
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
   * Delete entities, relations, or observations.
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
   * Get information about the knowledge graph, search for nodes, get course overview, get upcoming deadlines, get assignment status, get exam prep, find related concepts, track lecture notes, or get term overview.
   */
  server.tool(
    "advancedcontext",
    toolDescriptions["advancedcontext"],
    {
      type: z.enum(["graph", "search", "nodes", "course", "deadlines", "assignment", "exam", "concepts", "lecture", "term"]).describe("Type of get operation: 'graph', 'search', 'nodes', 'course', 'deadlines', 'assignment', 'exam', 'concepts', 'lecture', or 'term'"),
      params: z.record(z.string(), z.any()).describe("Parameters for the operation, structure varies by type")
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
            
          case "course":
            result = await knowledgeGraphManager.getCourseOverview(params.courseName);
            return {
              content: [{
                type: "text",
                text: JSON.stringify({ success: true, course: result }, null, 2)
              }]
            };
            
          case "deadlines":
            result = await knowledgeGraphManager.getUpcomingDeadlines(
              params.termName, 
              params.courseName, 
              params.daysAhead || 14
            );
            return {
              content: [{
                type: "text",
                text: JSON.stringify({ success: true, deadlines: result }, null, 2)
              }]
            };
            
          case "assignment":
            result = await knowledgeGraphManager.getAssignmentStatus(params.assignmentName);
            return {
              content: [{
                type: "text",
                text: JSON.stringify({ success: true, assignment: result }, null, 2)
              }]
            };
            
          case "exam":
            result = await knowledgeGraphManager.getExamPrep(params.examName);
            return {
              content: [{
                type: "text",
                text: JSON.stringify({ success: true, exam: result }, null, 2)
              }]
            };
            
          case "concepts":
            result = await knowledgeGraphManager.findRelatedConcepts(
              params.conceptName,
              params.depth || 1
            );
            return {
              content: [{
                type: "text",
                text: JSON.stringify({ success: true, concepts: result }, null, 2)
              }]
            };
            
          case "lecture":
            result = await knowledgeGraphManager.trackLectureNotes(params.courseName);
            return {
              content: [{
                type: "text",
                text: JSON.stringify({ success: true, lectures: result }, null, 2)
              }]
            };
            
          case "term":
            result = await knowledgeGraphManager.getTermOverview(params.termName);
            return {
              content: [{
                type: "text",
                text: JSON.stringify({ success: true, term: result }, null, 2)
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

  // Start the server
  try {
    const transport = new StdioServerTransport();
    await server.connect(transport);
  } catch (error) {
    console.error("Error starting server:", error);
    process.exit(1);
  }
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
}); 

// Export the KnowledgeGraphManager class for testing
export { KnowledgeGraphManager }; 