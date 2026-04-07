import { IsArray, IsOptional, IsString } from 'class-validator';

export class SendMessageDto {
  @IsString()
  text!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  images?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  attachmentFilenames?: string[];
}
