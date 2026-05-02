import { Injectable } from '@angular/core';
import emailjs from '@emailjs/browser';

@Injectable({
  providedIn: 'root',
})
export class EmailService {
  private readonly serviceId = 'service_mlygcxu';
  private readonly templateId = 'template_smii3te';
  private readonly publicKey = 'Y6jH-ln7Hfwetn34Q';

  async sendCredentials(data: {
    toEmail: string;
    fullName: string;
    username: string;
    password: string;
    role: string;
  }): Promise<void> {
    await emailjs.send(
      this.serviceId,
      this.templateId,
      {
        to_email: data.toEmail,
        full_name: data.fullName,
        username: data.username,
        password: data.password,
        role: data.role,
        system_name: 'Student Attendance Monitoring System',
      },
      this.publicKey,
    );
  }
}
