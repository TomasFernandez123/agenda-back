import { UsersService } from './users.service';
import { UserRole } from './schemas/user.schema';

describe('UsersService findOrCreateClientForTenant', () => {
  const userModel = {
    findOne: jest.fn(),
    findByIdAndUpdate: jest.fn(),
    create: jest.fn(),
  } as any;

  let service: UsersService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new UsersService(userModel);
  });

  it('reuses existing client by email within tenant', async () => {
    userModel.findOne.mockReturnValueOnce({
      lean: jest.fn().mockResolvedValue({
        _id: '65f1aa111111111111111120',
        role: UserRole.CLIENT,
        name: 'Juan',
        email: 'juan@mail.com',
        phone: '+5491111111111',
      }),
    });

    const result = await service.findOrCreateClientForTenant({
      tenantId: '65f1aa111111111111111111',
      name: 'Juan',
      email: 'JUAN@mail.com',
      phone: '+54 9 11 1111 1111',
    });

    expect(result._id).toBe('65f1aa111111111111111120');
    expect(userModel.create).not.toHaveBeenCalled();
  });

  it('creates a new client when email does not exist', async () => {
    userModel.findOne.mockReturnValueOnce({
      lean: jest.fn().mockResolvedValue(null),
    });
    userModel.create.mockResolvedValueOnce({
      _id: '65f1aa111111111111111121',
      role: UserRole.CLIENT,
      name: 'Ana',
      email: 'ana@mail.com',
      phone: '+5492222222222',
    });

    const result = await service.findOrCreateClientForTenant({
      tenantId: '65f1aa111111111111111111',
      name: 'Ana',
      email: 'ana@mail.com',
      phone: '+54 9 22 2222 2222',
    });

    expect(result._id).toBe('65f1aa111111111111111121');
    expect(userModel.create).toHaveBeenCalledTimes(1);
    expect(userModel.create).toHaveBeenCalledWith(
      expect.objectContaining({ role: UserRole.CLIENT, email: 'ana@mail.com' }),
    );
  });
});
