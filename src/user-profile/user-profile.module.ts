import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { UserProfileController } from './user-profile.controller';
import { UserProfileService } from './user-profile.service';
import { UserProfileStorageService } from './user-profile-storage.service';

@Module({
  imports: [PrismaModule],
  controllers: [UserProfileController],
  providers: [UserProfileService, UserProfileStorageService],
  exports: [UserProfileService],
})
export class UserProfileModule {}
