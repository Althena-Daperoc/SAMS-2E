import { Injectable } from '@angular/core';
import Swal, { SweetAlertIcon, SweetAlertResult } from 'sweetalert2';

@Injectable({
  providedIn: 'root',
})
export class AlertService {
  private readonly basePopupClass = {
    popup: 'sams-swal-popup',
    title: 'sams-swal-title',
    htmlContainer: 'sams-swal-text',
    confirmButton: 'sams-swal-confirm',
    cancelButton: 'sams-swal-cancel',
  };

  private readonly baseToastClass = {
    popup: 'sams-swal-toast',
    title: 'sams-swal-toast-title',
  };

  private fire(
    icon: SweetAlertIcon,
    title: string,
    text: string,
    confirmButtonText = 'OK',
  ): Promise<SweetAlertResult> {
    return Swal.fire({
      icon,
      title,
      text,
      confirmButtonText,
      buttonsStyling: false,
      customClass: this.basePopupClass,
      heightAuto: false,
    });
  }

  success(title: string, text: string, confirmButtonText = 'OK'): Promise<SweetAlertResult> {
    return this.fire('success', title, text, confirmButtonText);
  }

  error(title: string, text: string, confirmButtonText = 'OK'): Promise<SweetAlertResult> {
    return this.fire('error', title, text, confirmButtonText);
  }

  warning(title: string, text: string, confirmButtonText = 'OK'): Promise<SweetAlertResult> {
    return this.fire('warning', title, text, confirmButtonText);
  }

  info(title: string, text: string, confirmButtonText = 'OK'): Promise<SweetAlertResult> {
    return this.fire('info', title, text, confirmButtonText);
  }

  question(title: string, text: string, confirmButtonText = 'OK'): Promise<SweetAlertResult> {
    return this.fire('question', title, text, confirmButtonText);
  }

  confirm(
    title: string,
    text: string,
    confirmButtonText = 'Yes',
    cancelButtonText = 'Cancel',
  ): Promise<SweetAlertResult> {
    return Swal.fire({
      icon: 'question',
      title,
      text,
      showCancelButton: true,
      confirmButtonText,
      cancelButtonText,
      reverseButtons: true,
      buttonsStyling: false,
      customClass: this.basePopupClass,
      heightAuto: false,
    });
  }

  toastSuccess(title: string): Promise<SweetAlertResult> {
    return Swal.fire({
      toast: true,
      position: 'top-end',
      icon: 'success',
      title,
      showConfirmButton: false,
      timer: 2200,
      timerProgressBar: true,
      customClass: this.baseToastClass,
    });
  }

  toastError(title: string): Promise<SweetAlertResult> {
    return Swal.fire({
      toast: true,
      position: 'top-end',
      icon: 'error',
      title,
      showConfirmButton: false,
      timer: 2500,
      timerProgressBar: true,
      customClass: this.baseToastClass,
    });
  }

  loading(title = 'Please wait...', text = 'Processing your request.'): void {
    Swal.fire({
      title,
      text,
      allowOutsideClick: false,
      allowEscapeKey: false,
      showConfirmButton: false,
      didOpen: () => {
        Swal.showLoading();
      },
      customClass: this.basePopupClass,
      heightAuto: false,
    });
  }

  close(): void {
    Swal.close();
  }
}
