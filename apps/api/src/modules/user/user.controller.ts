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
import { AddAreaAssignmentDto } from './dto/area-assignment.dto';
import { UserQueryDto } from './dto/user-query.dto';
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
    @Req() req: Request & { user: JwtPayload; requestId?: string },
  ) {
    return this.userService.createUser(dto, req.user.sub, req.user.role, {
      ipAddress: req.ip ?? '0.0.0.0',
      requestId: req.requestId,
    });
  }

  @Get()
  @RequirePermission('user.read')
  @ApiOperation({ summary: 'List all users' })
  @ApiQuery({ name: 'skip', required: false, type: Number })
  @ApiQuery({ name: 'take', required: false, type: Number })
  @ApiQuery({ name: 'role', required: false, type: String })
  @ApiQuery({ name: 'search', required: false, type: String })
  async findAll(@Query() query: UserQueryDto) {
    // H10b — pagination + role + search are now validated by UserQueryDto.
    return this.userService.findAll({
      skip: query.skip,
      take: query.take,
      role: query.role,
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
    @Req() req: Request & { user: JwtPayload; requestId?: string },
  ) {
    return this.userService.updateUser(id, dto, req.user.sub, req.user.role, {
      ipAddress: req.ip ?? '0.0.0.0',
      requestId: req.requestId,
    });
  }

  @Post(':id/area-assignments')
  @RequirePermission('user.update')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Assign area to user' })
  @ApiResponse({ status: 201, description: 'Area assigned' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async addAreaAssignment(
    @Param('id') userId: string,
    @Body() dto: AddAreaAssignmentDto,
    @Req() req: Request & { user: JwtPayload; requestId?: string },
  ) {
    // H10a — areaName is validated by AddAreaAssignmentDto (charset, length).
    return this.userService.addAreaAssignment(
      userId,
      dto.areaName,
      req.user.sub,
      req.user.role,
      { ipAddress: req.ip ?? '0.0.0.0', requestId: req.requestId },
    );
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
    @Req() req: Request & { user: JwtPayload; requestId?: string },
  ) {
    return this.userService.removeAreaAssignment(
      userId,
      areaId,
      req.user.sub,
      req.user.role,
      { ipAddress: req.ip ?? '0.0.0.0', requestId: req.requestId },
    );
  }
}
