# MCP Context Manager and Domain Servers

A collection of Model Context Protocol (MCP) servers to enhance AI models with persistent context across work sessions throughout the project lifecycle. Context for each project is stored in a domain-specific knowledge graph handled by the domain's server. All domain servers can be managed through a central Context Manager that provides unified access. 

Each domain server is also a standalone MCP Server that you can use on its own without the Context Manager.

## Features

- **Persistent Context**: Easily build, load, and manipulate context as you progress from idea to production/publication/completion
- **Efficienct Access**: Instead of loading huge markdown files that clog up the context window, enable AI models to grab the exact context they need when they need it
- **Session Management**: 
  1. `startsession` tool to get an overview of what you've been working on in past sessions
  2. `endsession` tool to analyze the entire session and update knowledge graph for future sessions
- **Cross-Domain Support**: Work with multiple knowledge domains through a single interface, including creating relationships between entities in different domains

## Why knowledge graphs?

To free up the context window (performance), and minimize token cost (efficiency).

## Available Servers

The contextmanager orchestrates several domain-specific MCP servers:

1. **Developer MCP Server**: Manages software development context with entities like projects, components, and tasks.

2. **Project MCP Server**: Manages project management context with entities like projects, tasks, and resources.

3. **Student MCP Server**: Manages educational context with entities like courses, assignments, and exams.

4. **Qualitative Research MCP Server**: Manages qualitative research context with entities like studies, participants, and interviews.

5. **Quantitative Research MCP Server**: Manages quantitative research context with entities like datasets, variables, and analyses.

For detailed documentation on each domain server, see the README files in their respective directories:
- [Developer Server](./domains/developer/README.md)
- [Project Server](./domains/project/README.md)
- [Student Server](./domains/student/README.md)
- [Qualitative Research Server](./domains/qualitativeresearch/README.md)
- [Quantitative Research Server](./domains/quantitativeresearch/README.md)

## Context Manager Benefits

The Context Manager provides:

- **Unified Interface**: Access all domain servers through a single interface.
- **Smart Routing**: Automatically routes requests to the appropriate domain server.
- **Cross-Domain Context**: Maintains references across different domains.

## Implementation

The Context Manager uses the MCP Client SDK to communicate with domain-specific MCP servers. It:

1. Maintains a registry of domain servers with their connection information
2. Creates MCP clients to connect to each domain server
3. Routes requests to the appropriate domain server based on the active domain
4. Provides cross-domain functionality for relating entities across domains

## Path Resolution

The Context Manager uses absolute paths constructed at runtime to locate domain servers. If you need to modify paths to domain servers, update the `domains` array in `main/index.ts`.

## Installation & Usage

You can use the MCP Context Manager in several ways:

### Using npx (Recommended)

Run directly with npx:

```bash
npx github:tejpalvirk/contextmanager
```

### Global Installation

Install globally to make all servers available as commands:

```bash
npm install -g github:tejpalvirk/contextmanager
```

Then run:

```bash
mcp-server-contextmanager
```

Or run a specific domain server directly:

```bash
mcp-server-developer
mcp-server-project
mcp-server-student
mcp-server-researcher-qualitative
mcp-server-researcher-quantitative
```

### Clone and Build from Source

For development or customization:

```bash
git clone https://github.com/tejpalvirk/contextmanager.git
cd contextmanager
npm install
npm run build
```

Then run:

```bash
node main/index.js
```

## Command-Line Arguments

The Context Manager and domain servers accept the following command-line arguments:

```bash
# Run on a specific port (default: 3000)
npx github:tejpalvirk/contextmanager --port 3001

# Enable debug logging
npx github:tejpalvirk/contextmanager --debug

# Specify a config file
npx github:tejpalvirk/contextmanager --config ./my-config.json

# Run only specific domain servers
npx github:tejpalvirk/contextmanager --domains developer,project
```

## Interacting with Domain Servers

### Domain Management

Use the `setActiveDomain` tool to select which domain you want to work with:

```
setActiveDomain(domain="developer")
```

### Session Management

Start a new session for the active domain:

```
startsession(domain="developer")
```

End a session when you're done:

```
endsession(sessionId="session_id_here", stage="assembly", stageNumber=6, totalStages=6, nextStageNeeded=false)
```

### Context Operations

Build context for the active domain:

```
buildcontext(type="entities", data={...})
```

Load context for a specific entity:

```
loadcontext(entityName="MyProject", entityType="project")
```

Delete context:

```
deletecontext(type="entities", data={...})
```

### Example: Working with the Developer Domain

```javascript
// Set the active domain to developer
setActiveDomain(domain="developer")

// Start a new session
startsession(domain="developer")

// Create a new project entity
buildcontext(type="entities", data={
  "entityType": "project",
  "name": "MyProject",
  "description": "A sample project",
  "language": "TypeScript",
  "framework": "React"
})

// Load context for the project
loadcontext(entityName="MyProject", entityType="project")

// Create a component for the project
buildcontext(type="entities", data={
  "entityType": "component",
  "name": "AuthService",
  "project": "MyProject",
  "description": "Authentication service component",
  "dependencies": ["UserService"]
})
```

### Cross-Domain Operations

Create relationships between entities in different domains:

```
relateCrossDomain(fromDomain="developer", fromEntity="ProjectX", toDomain="project", toEntity="ProjectX", relationType="manages")
```

### Example: Cross-Domain Integration

```javascript
// Create relationship between developer project and project management task
relateCrossDomain(
  fromDomain="developer", 
  fromEntity="MyProject", 
  toDomain="project", 
  toEntity="ProjectX", 
  relationType="manages"
)
```

## Integration with Claude

In Claude Desktop, configure the Context Manager in settings:

```json
{
  "mcpServers": {
    "contextmanager": {
      "command": "npx",
      "args": [
        "-y",
        "github:tejpalvirk/contextmanager"
      ],
      "options": {
        "port": 3000,
        "domains": ["developer", "project", "student"]
      }
    }
  }
}
```

## Troubleshooting

### Common Issues

1. **Port Already in Use**:
   ```
   Error: listen EADDRINUSE: address already in use :::3000
   ```
   Solution: Use the `--port` option to specify a different port.

2. **Connection Refused**:
   ```
   Error: connect ECONNREFUSED 127.0.0.1:3000
   ```
   Solution: Ensure the server is running and accessible at the specified address.

3. **Domain Server Not Found**:
   ```
   Error: Domain server 'developer' not found
   ```
   Solution: Check that the domain name is correct and the server is registered in the Context Manager.

4. **Path Resolution Errors**:
   ```
   Error: Cannot find module '...'
   ```
   Solution: Ensure all paths in the `domains` array in `main/index.ts` are correctly specified.

5. **Method Not Found**:
   ```
   Error: Method 'buildcontext' not found in domain 'developer'
   ```
   Solution: Verify the method name and ensure it is supported by the domain server.

### Debugging

For detailed logging, use the `--debug` flag:

```bash
npx github:tejpalvirk/contextmanager --debug
```

## Versioning

This package follows [Semantic Versioning](https://semver.org/):

- **MAJOR**: Incompatible API changes
- **MINOR**: Backwards-compatible functionality additions
- **PATCH**: Backwards-compatible bug fixes

Current version: 1.0.0

## Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Coding Standards

- Use TypeScript for all new code
- Follow the existing code style
- Add tests for new functionality
- Update documentation as needed

## Development

### Prerequisites

- Node.js v16 or higher
- npm v7 or higher

### Building

```bash
npm install
npm run build
```

### Testing

```bash
npm test
```

## License

MIT

## Acknowledgments

This project builds on the Model Context Protocol created by Anthropic for Claude. 