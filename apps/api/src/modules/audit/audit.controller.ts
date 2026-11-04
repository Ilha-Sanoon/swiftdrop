import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsISO8601, IsOptional, IsString, MinLength } from 'class-validator';
import { Roles } from '../../common/auth';
import { PaginationQuery } from '../../common/pagination/pagination';
import { AuditService } from './audit.service';

export class AuditUserLookupDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiProperty() email: string;
}

export class AuditUserLookupPageDto {
  @ApiProperty({ type: [AuditUserLookupDto] }) data: AuditUserLookupDto[];
  @ApiProperty() meta: { page: number; pageSize: number; total: number };
}

export class ListAuditUsersQuery extends PaginationQuery {
  @ApiPropertyOptional() @IsString() @MinLength(1) search!: string;
}

export class ListAuditLogsQuery extends PaginationQuery {
  @ApiPropertyOptional() @IsOptional() @IsString() action?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() entityType?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() entityId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() actorId?: string;
  @ApiPropertyOptional() @IsOptional() @IsISO8601() from?: string;
  @ApiPropertyOptional() @IsOptional() @IsISO8601() to?: string;
}

/** Owner: M9 */
@ApiTags('audit')
@Controller('admin/audit-logs')
@Roles('ADMIN')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  list(@Query() q: ListAuditLogsQuery) {
    return this.audit.list(q);
  }

  @Get('users')
  @ApiOkResponse({ type: AuditUserLookupPageDto })
  users(@Query() q: ListAuditUsersQuery) {
    return this.audit.listUsers(q);
  }
}
