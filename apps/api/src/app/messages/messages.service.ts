import { Injectable } from '@nestjs/common';

@Injectable()
export class MessagesService {
  all(): Array<{ id: string; role: string; body: string; created_at: string }> {
    return [];
  }
}
