# Project MCP Server

An MCP server implementation that provides tools for managing project knowledge graphs, enabling structured representation of projects, tasks, milestones, resources, and team members. This server helps project managers track progress, manage risks, allocate resources, and make informed decisions.

## Features

- **Persistent Project Context**: Maintain a structured knowledge graph of project entities and relationships across multiple sessions
- **Session Management**: Track project management sessions with unique IDs and record progress over time
- **Project Status Tracking**: Monitor project health, risks, and issue status in real time
- **Task Dependencies**: Visualize and manage dependencies between tasks to identify bottlenecks
- **Milestone Progress**: Track progress towards key project milestones
- **Resource Allocation**: Monitor how resources are distributed across projects and tasks
- **Risk Assessment**: Identify, monitor, and mitigate project risks
- **Decision Logging**: Record important project decisions and their context
- **Team Member Management**: Track assignments and workloads for team members
- **Project Timeline Analysis**: Analyze project timelines including critical paths

## Entities

The Project MCP Server recognizes the following entity types:

- **project**: The main container for all related entities
- **task**: Individual work items that need to be completed
- **milestone**: Key checkpoints or deliverables in the project
- **resource**: Materials, tools, or assets needed for the project
- **teamMember**: People involved in the project
- **note**: Documentation, ideas, or observations
- **document**: Formal project documents
- **issue**: Problems or blockers
- **risk**: Potential future problems
- **decision**: Important choices made during the project
- **dependency**: External requirements or prerequisites
- **component**: Parts or modules of the project
- **stakeholder**: People affected by or interested in the project
- **change**: Modifications to project scope or requirements

## Relationships

Entities can be connected through the following relationship types:

- **part_of**: Indicates an entity is a component/subset of another
- **depends_on**: Shows dependencies between entities
- **assigned_to**: Links tasks to team members
- **created_by**: Tracks who created an entity
- **modified_by**: Records who changed an entity
- **related_to**: Shows general connections between entities
- **blocks**: Indicates one entity is blocking another
- **manages**: Shows management relationships
- **contributes_to**: Shows contributions to entities
- **documents**: Links documentation to entities
- **scheduled_for**: Connects entities to dates or timeframes
- **responsible_for**: Assigns ownership/responsibility
- **reports_to**: Indicates reporting relationships
- **categorized_as**: Links entities to categories or types
- **required_for**: Shows requirements for completion
- **discovered_in**: Links issues to their discovery context
- **resolved_by**: Shows what resolved an issue
- **impacted_by**: Shows impact relationships
- **stakeholder_of**: Links stakeholders to projects/components
- **prioritized_as**: Indicates priority levels

## Available Tools

The Project MCP Server provides these tools for interacting with project knowledge:

### startsession
Starts a new project management session, generating a unique session ID and displaying current projects, tasks, milestones, risks, and recent sessions.

### loadcontext
Loads detailed context for a specific entity (project, task, etc.), displaying relevant information based on entity type.

### endsession
Records the results of a project management session through a structured, multi-stage process:
1. **summary**: Records session summary, duration, and project focus
2. **achievements**: Documents key achievements from the session
3. **taskUpdates**: Tracks updates to existing tasks
4. **newTasks**: Records new tasks created during the session
5. **projectStatus**: Updates overall project status and observations
6. **riskUpdates**: Tracks changes to project risks
7. **assembly**: Final assembly of all session data

### buildcontext
Creates new entities, relations, or observations in the knowledge graph:
- **entities**: Add new project-related entities (projects, tasks, milestones, etc.)
- **relations**: Create relationships between entities
- **observations**: Add observations to existing entities

### deletecontext
Removes entities, relations, or observations from the knowledge graph:
- **entities**: Remove project entities
- **relations**: Remove relationships between entities
- **observations**: Remove specific observations from entities

### advancedcontext
Retrieves information from the knowledge graph:
- **graph**: Get the entire knowledge graph
- **search**: Search for nodes based on query criteria
- **nodes**: Get specific nodes by name
- **related**: Find related entities

## Domain-Specific Functions

The Project MCP Server includes specialized domain functions for project management:

- **getProjectOverview**: Comprehensive view of a project including tasks, milestones, team members, issues, etc.
- **getTaskDependencies**: Analyze task dependencies to identify blocked tasks and critical paths
- **getTeamMemberAssignments**: View all assignments for a specific team member
- **getMilestoneProgress**: Track progress towards project milestones
- **getProjectTimeline**: Analyze project timeline and key dates
- **getResourceAllocation**: Examine how resources are allocated across the project
- **getProjectRisks**: Identify and assess project risks
- **findRelatedProjects**: Discover connections between different projects
- **getDecisionLog**: Track decision history and context
- **getProjectHealth**: Assess overall project health with metrics and recommendations

## Example Prompts

### Starting a Session
```
Let's start a new project management session to review the Mobile App Development project.
```

### Loading Project Context
```
Load the context for the Mobile App Development project so I can see its current status.
```

### Recording Session Results
```
I've just finished a project review meeting for Mobile App Development. We completed the UI design milestone, identified 2 new risks related to the backend API, and assigned 3 new tasks to the development team. The project is still on track but we need to monitor the API risks closely.
```

### Managing Project Knowledge
```
Create a new task called "Implement User Authentication" that's part of the Mobile App Development project, assigned to Sarah, with high priority and due in two weeks.
```

```
Update the status of the "Database Migration" task to "completed" and add an observation that it was finished ahead of schedule.
```

## Usage

This MCP server enables project managers to:

- **Maintain Context Continuity**: Keep track of project details across multiple planning sessions
- **Onboard New Team Members**: Quickly get new team members up to speed on project status
- **Record Session Results**: Document the outcomes of meetings and work sessions
- **Track Dependencies**: Identify and manage critical dependencies and bottlenecks
- **Monitor Risk**: Keep track of project risks and implement mitigation strategies
- **Allocate Resources**: Optimize resource allocation across projects and tasks
- **Make Informed Decisions**: Base decisions on comprehensive project data

## Configuration

### Usage with Claude Desktop

Add this to your `claude_desktop_config.json`:

#### Install from GitHub and run with npx

```json
{
  "mcpServers": {
    "project": {
      "command": "npx",
      "args": [
        "-y",
        "github:tejpalvirk/project"
      ]
    }
  }
}
```

#### Install globally and run directly

First, install the package globally:

```bash
npm install -g github:tejpalvirk/project
```

Then configure Claude Desktop:

```json
{
  "mcpServers": {
    "project": {
      "command": "contextmanager-project"
    }
  }
}
```

#### docker

```json
{
  "mcpServers": {
    "project": {
      "command": "docker",
      "args": [
        "run",
        "--rm",
        "-i",
        "mcp/project"
      ]
    }
  }
}
```

## Building

### From Source

```bash
# Clone the repository
git clone https://github.com/tejpalvirk/contextmanager.git
cd contextmanager

# Install dependencies
npm install

# Build the server
npm run build

# Run the server
cd project
node project_index.js
```

### Docker:

```bash
docker build -t mcp/project -f project/Dockerfile .
```

## License

This MCP server is licensed under the MIT License. This means you are free to use, modify, and distribute the software, subject to the terms and conditions of the MIT License. For more details, please see the LICENSE file in the project repository. 