import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  Query,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { GroupService } from './group.service';
import { CreateGroupDto } from './dto/create-group.dto';
import { AddGroupMemberDto } from './dto/add-group-member.dto';
import { PostGroupCollectionDto } from './dto/post-group-collection.dto';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';

@ApiTags('groups')
@Controller('groups')
export class GroupController {
  constructor(private readonly groupService: GroupService) {}

  @Post()
  @RequirePermission('group.create')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new group' })
  @ApiResponse({ status: 201, description: 'Group created' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 404, description: 'Leader customer not found' })
  async createGroup(
    @Body() dto: CreateGroupDto,
    @Req() req: { user: { sub: string; role: string } },
  ) {
    return this.groupService.createGroup(dto, req.user.sub, req.user.role);
  }

  @Get()
  @RequirePermission('group.read')
  @ApiOperation({ summary: 'List groups with pagination' })
  @ApiQuery({ name: 'skip', required: false, type: Number })
  @ApiQuery({ name: 'take', required: false, type: Number })
  @ApiQuery({ name: 'status', required: false, type: String })
  @ApiQuery({ name: 'branchArea', required: false, type: String })
  async findAll(
    @Query('skip') skip?: string,
    @Query('take') take?: string,
    @Query('status') status?: string,
    @Query('branchArea') branchArea?: string,
  ) {
    return this.groupService.findAll({
      skip: skip ? parseInt(skip, 10) : undefined,
      take: take ? parseInt(take, 10) : undefined,
      status,
      branchArea,
    });
  }

  @Get(':id')
  @RequirePermission('group.read')
  @ApiOperation({ summary: 'Get group by ID' })
  @ApiResponse({ status: 200, description: 'Group found' })
  @ApiResponse({ status: 404, description: 'Group not found' })
  async findById(@Param('id') id: string) {
    return this.groupService.findById(id);
  }

  @Post(':id/members')
  @RequirePermission('group.manage_members')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Add a member to a group' })
  @ApiResponse({ status: 201, description: 'Member added' })
  @ApiResponse({ status: 400, description: 'Business rule violation' })
  @ApiResponse({ status: 404, description: 'Group or customer not found' })
  async addMember(
    @Param('id') groupId: string,
    @Body() dto: AddGroupMemberDto,
    @Req() req: { user: { sub: string; role: string } },
  ) {
    return this.groupService.addMember(groupId, dto, req.user.sub, req.user.role);
  }

  @Delete(':id/members/:memberId')
  @RequirePermission('group.manage_members')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove a member from a group' })
  @ApiResponse({ status: 200, description: 'Member removed' })
  @ApiResponse({ status: 400, description: 'Business rule violation (active loans or min size)' })
  @ApiResponse({ status: 404, description: 'Group or member not found' })
  async removeMember(
    @Param('id') groupId: string,
    @Param('memberId') memberId: string,
    @Req() req: { user: { sub: string; role: string } },
  ) {
    return this.groupService.removeMember(groupId, memberId, req.user.sub, req.user.role);
  }

  @Post(':id/collections')
  @RequirePermission('group.collect')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Post a group collection with member-wise breakdown' })
  @ApiResponse({ status: 201, description: 'Group collection posted' })
  @ApiResponse({ status: 400, description: 'Sum mismatch or business rule violation' })
  @ApiResponse({ status: 404, description: 'Group not found' })
  async postGroupCollection(
    @Param('id') groupId: string,
    @Body() dto: PostGroupCollectionDto,
    @Req() req: { user: { sub: string; role: string } },
  ) {
    return this.groupService.postGroupCollection(groupId, dto, req.user.sub, req.user.role);
  }

  @Get(':id/summary')
  @RequirePermission('group.read')
  @ApiOperation({ summary: 'Get group summary with delinquency status' })
  @ApiResponse({ status: 200, description: 'Group summary' })
  @ApiResponse({ status: 404, description: 'Group not found' })
  async getGroupSummary(@Param('id') groupId: string) {
    return this.groupService.getGroupSummary(groupId);
  }
}
