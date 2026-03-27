import { Controller, Get } from '@nestjs/common';

export interface RuntimeConfig {
  userAvatarUrl: string | null;
  userAvatarBase64: string | null;
  assistantAvatarUrl: string | null;
  assistantAvatarBase64: string | null;
}

@Controller()
export class RuntimeConfigController {
  @Get('runtime-config')
  getConfig(): RuntimeConfig {
    return {
      userAvatarUrl: process.env.USER_AVATAR_URL?.trim() || null,
      userAvatarBase64: process.env.USER_AVATAR_BASE64?.trim() || null,
      assistantAvatarUrl: process.env.ASSISTANT_AVATAR_URL?.trim() || null,
      assistantAvatarBase64: process.env.ASSISTANT_AVATAR_BASE64?.trim() || null,
    };
  }
}
