import { McpServer } from "@modelcontextprotocol/server";
import {
  memorySkillFiles,
  type SkillCatalog,
  SkillsExtension,
} from "@modelcontextprotocol/server/ext/skills";
import { registerPondPrompts } from "./prompts";
import { registerPondResources } from "./resources";
import { POND_INSTRUCTIONS, POND_SKILL, POND_SKILL_NAME } from "./skill";
import { registerPondTools } from "./tools";

export function loadPondSkills(): Promise<SkillCatalog> {
  return SkillsExtension.load(
    memorySkillFiles({ [`${POND_SKILL_NAME}/SKILL.md`]: POND_SKILL }),
  );
}

export function createPondServer(
  version: string,
  skills?: SkillCatalog,
): McpServer {
  const server = new McpServer(
    { name: "pond", title: "Pond", version },
    { instructions: POND_INSTRUCTIONS },
  );
  registerPondTools(server);
  registerPondResources(server);
  registerPondPrompts(server);
  skills?.attach(server);
  return server;
}
