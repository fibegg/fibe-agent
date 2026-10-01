import { IsString, IsOptional, IsArray, IsUUID } from 'class-validator';

export class SendMessageDto {
  @IsString()
  text!: string;

  @IsOptional()
  @IsUUID()
  requestId?: string;

  @IsOptional()
  @IsUUID()
  storeGeneration?: string;

  @IsOptional()
  @IsString()
  conversationId?: string;

  @IsOptional()
  @IsString()
  busyPolicy?: 'reject' | 'queue' | 'steer';

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  images?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  attachmentFilenames?: string[];
}
