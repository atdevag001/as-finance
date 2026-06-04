import {
  BadRequestException,
  Controller,
  Get,
  Patch,
  Put,
  Body,
  Param,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { SettingsService } from './settings.service';
import {
  UpdateSettingDto,
  UpdateHolidaysDto,
  hasPrototypePollutionKey,
} from './dto/update-setting.dto';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';

@ApiTags('settings')
@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  @RequirePermission('settings.read')
  @ApiOperation({ summary: 'List all system settings' })
  @ApiResponse({ status: 200, description: 'All settings' })
  async findAll() {
    return this.settingsService.findAll();
  }

  @Patch(':key')
  @RequirePermission('settings.update')
  @ApiOperation({ summary: 'Update a system setting by key (super_admin only)' })
  @ApiResponse({ status: 200, description: 'Setting updated' })
  async updateByKey(
    @Param('key') key: string,
    @Body() dto: UpdateSettingDto,
    @Req() req: { user: { sub: string } },
  ) {
    // M11 — settings are persisted as JSONB and may be re-hydrated into
    // arbitrary in-memory objects. Reject any payload that contains
    // __proto__ / constructor / prototype keys at any depth so the
    // assignment cannot mutate the prototype chain.
    if (hasPrototypePollutionKey(dto.value)) {
      throw new BadRequestException({
        code: 'PROTOTYPE_POLLUTION',
        message:
          'Setting value contains a reserved key (__proto__, constructor, or prototype).',
      });
    }
    return this.settingsService.updateByKey(key, dto.value, req.user.sub, dto.description);
  }

  @Get('holidays')
  @RequirePermission('settings.read')
  @ApiOperation({ summary: 'Get holiday calendar' })
  @ApiResponse({ status: 200, description: 'Array of ISO date strings' })
  async getHolidays() {
    return this.settingsService.getHolidays();
  }

  @Put('holidays')
  @RequirePermission('settings.update')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Replace holiday calendar (super_admin only)' })
  @ApiResponse({ status: 200, description: 'Updated holiday list' })
  async setHolidays(
    @Body() dto: UpdateHolidaysDto,
    @Req() req: { user: { sub: string } },
  ) {
    return this.settingsService.setHolidays(dto.holidays, req.user.sub);
  }
}
