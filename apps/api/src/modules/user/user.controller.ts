import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { Request } from 'express';
import { UserService } from './user.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { JwtPayload } from '../../common/guards/jwt-auth.guard';

@ApiTags('users')
@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Post()
  @RequirePermission('user.create')
  @ApiOperation({ summary: 'Create a new user' })
  @ApiResponse({ status: 201, description: 'User created' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 409, description: 'Username/mobile/email conflict' })
  async create(
    @Body() dto: CreateUserDto,
    @Req() req: Request & { user: JwtPayload },
  ) {
    return this.userService.createUser(dto, req.user.sub, req.user.role);
  }

  @Get()
  @RequirePermission('user.read')
  @ApiOperation({ summary: 'List all users' })
  @ApiQuery({ name: 'skip', required: false, type: Number })
  @ApiQuery({ name: 'take', required: false, type: Number })
  @ApiQuery({ name: 'role', required: false, type: String })
  async findAll(
    @Query('skip') skip?: string,
    @Query('take') take?: string,
    @Query('role') role?: string,
  ) {
    return this.userService.findAll({
      skip: skip ? parseInt(skip, 10) : undefined,
      take: take ? parseInt(take, 10) : undefined,
      role,
    });
  }

  @Get(':id')
  @RequirePermission('user.read')
  @ApiOperation({ summary: 'Get user by ID' })
  @ApiResponse({ status: 200, description: 'User found' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async findById(@Param('id') id: string) {
    return this.userService.findById(id);
  }

  @Patch(':id')
  @RequirePermission('user.update')
  @ApiOperation({ summary: 'Update user' })
  @ApiResponse({ status: 200, description: 'User updated' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @Req() req: Request & { user: JwtPayload },
  ) {
    return this.userService.updateUser(id, dto, req.user.sub, req.user.role);
  }

  @Post(':id/area-assignments')
  @RequirePermission('user.update')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Assign area to user' })
  @ApiResponse({ status: 201, description: 'Area assigned' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async addAreaAssignment(
    @Param('id') userId: string,
    @Body('areaName') areaName: string,
    @Req() req: Request & { user: JwtPayload },
  ) {
    return this.userService.addAreaAssignment(userId, areaName, req.user.sub);
  }

  @Delete(':id/area-assignments/:areaId')
  @RequirePermission('user.update')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove area assignment from user' })
  @ApiResponse({ status: 200, description: 'Area assignment removed' })
  @ApiResponse({ status: 404, description: 'Assignment not found' })
  async removeAreaAssignment(
    @Param('id') userId: string,
    @Param('areaId') areaId: string,
  ) {
    return this.userService.removeAreaAssignment(userId, areaId);
  }
}
