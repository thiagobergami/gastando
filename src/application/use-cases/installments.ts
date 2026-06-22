import type { InstallmentRepository } from '../../domain/ports';

export interface InstallmentUseCaseDeps {
  installments: InstallmentRepository;
}

export function makeInstallmentUseCases(deps: InstallmentUseCaseDeps) {
  const { installments } = deps;
  return {
    // Throws AppError(404) from the repository if the group does not exist.
    remove(id: number): void {
      installments.remove(id);
    },
  };
}
