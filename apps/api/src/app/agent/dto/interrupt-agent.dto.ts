import { IsOptional, IsString } from 'class-validator';

export class InterruptAgentDto {
  @IsOptional()
  @IsString()
  conversationId?: string;
}
