import request from 'supertest';
import { AuditService } from '../../src/modules/audit';
import { createTestApp, type TestContext } from '../utils/app';

const ACTION = 'm9.audit.integration';

describe('audit module (integration)', () => {
  let t: TestContext;
  let audit: AuditService;
  let adminId: string;
  let auditIds: string[] = [];

  beforeAll(async () => {
    t = await createTestApp();
    audit = t.app.get(AuditService);
    const admin = await t.prisma.user.findUniqueOrThrow({
      where: { email: 'admin@swiftdrop.test' },
    });
    adminId = admin.id;

    for (const [index, entityId] of ['m9-entity-1', 'm9-entity-2', 'm9-entity-3'].entries()) {
      await audit.record({
        actor: { id: admin.id, role: 'ADMIN' },
        action: ACTION,
        entityType: 'integration_test',
        entityId,
        metadata: {
          index,
          safe: 'visible',
          accessToken: 'must-not-be-returned',
        },
      });
    }

    const created = await t.prisma.auditLog.findMany({
      where: { action: ACTION },
      select: { id: true },
    });
    auditIds = created.map((entry) => entry.id);
  });

  afterAll(async () => {
    await t.prisma.auditLog.deleteMany({ where: { id: { in: auditIds } } });
    await t.close();
  });

  it('returns filtered, paginated audit records for admins', async () => {
    const response = await request(t.http)
      .get('/api/v1/admin/audit-logs')
      .query({
        action: ACTION,
        entityType: 'integration_test',
        actorId: adminId,
        from: '2026-01-01',
        to: '2027-01-01',
        page: 1,
        pageSize: 2,
      })
      .set('Cookie', await t.cookieFor('ADMIN'))
      .expect(200);

    expect(response.body.data).toHaveLength(2);
    expect(response.body.meta).toEqual({ page: 1, pageSize: 2, total: 3 });
    expect(response.body.data[0]).toEqual(
      expect.objectContaining({
        action: ACTION,
        entityType: 'integration_test',
        actor: {
          id: adminId,
          name: 'Ada Admin',
          email: 'admin@swiftdrop.test',
          role: 'ADMIN',
        },
      }),
    );
    expect(response.body.data[0].metadata).toEqual(expect.objectContaining({ safe: 'visible' }));
    expect(response.body.data[0].metadata.accessToken).toBeUndefined();
    expect(response.body.data[0].timestamp).toBeDefined();
  });

  it('filters by entity and supports empty results', async () => {
    const response = await request(t.http)
      .get('/api/v1/admin/audit-logs')
      .query({ action: ACTION, entityId: 'does-not-exist' })
      .set('Cookie', await t.cookieFor('ADMIN'))
      .expect(200);

    expect(response.body).toEqual({
      data: [],
      meta: { page: 1, pageSize: 20, total: 0 },
    });
  });

  it.each(['DISPATCHER', 'CUSTOMER'] as const)('rejects %s access', async (role) => {
    await request(t.http)
      .get('/api/v1/admin/audit-logs')
      .set('Cookie', await t.cookieFor(role))
      .expect(403);
  });

  it('does not persist audit records from a rolled-back transaction', async () => {
    const entityId = 'm9-rollback';
    await expect(
      t.prisma.$transaction(async (tx) => {
        await audit.record(
          {
            actor: { id: adminId, role: 'ADMIN' },
            action: ACTION,
            entityType: 'integration_test',
            entityId,
          },
          tx,
        );
        throw new Error('rollback');
      }),
    ).rejects.toThrow('rollback');

    expect(await t.prisma.auditLog.count({ where: { action: ACTION, entityId } })).toBe(0);
  });
});
