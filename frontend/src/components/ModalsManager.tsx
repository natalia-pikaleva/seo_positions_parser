import React from 'react';
import { RegisterManagerModal } from './RegisterManagerModal';
import { ChangePasswordModal } from './ChangePasswordModal';

interface ModalsManagerProps {
  isRegisterOpen: boolean;
  onCloseRegister: () => void;
  onRegisterSuccess: (username: string) => void;
  registerToken: string | null;
  showChangePasswordModal: boolean;
  onCloseChangePassword: () => void;
  changePasswordToken: string | null;
  onPasswordChanged: () => void;
}

export const ModalsManager: React.FC<ModalsManagerProps> = ({
  isRegisterOpen,
  onCloseRegister,
  onRegisterSuccess,
  registerToken,
  showChangePasswordModal,
  onCloseChangePassword,
  changePasswordToken,
  onPasswordChanged,
}) => {
  return (
    <>
      {isRegisterOpen && registerToken && (
        <RegisterManagerModal
          token={registerToken}
          onClose={onCloseRegister}
          onRegisterSuccess={onRegisterSuccess}
        />
      )}

      {showChangePasswordModal && changePasswordToken && (
        <ChangePasswordModal
          token={changePasswordToken}
          onClose={onCloseChangePassword}
          onPasswordChanged={onPasswordChanged}
        />
      )}
    </>
  );
};
