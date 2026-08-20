import { Controller } from '@nestjs/common';
import { MessagingService } from './messaging.service';

@Controller()
export class MessagingController {
  constructor(private readonly messagingService: MessagingService) {}
}
